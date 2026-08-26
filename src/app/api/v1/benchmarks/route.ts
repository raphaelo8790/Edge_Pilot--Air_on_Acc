/**
 * POST /api/v1/benchmarks — run a benchmark and record it.
 * GET  /api/v1/benchmarks — list recorded benchmarks for one owner.
 *
 * The response envelope ({ success, data } / { success, error }) is unchanged
 * from the scaffold, because the dashboard is being written against it.
 * Everything new lives inside `data`.
 *
 * This route is server-side only, which is where it must stay: it is the only
 * thing in the request path that can see GEMINI_API_KEY and GROQ_API_KEY.
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { digestPrompt } from '@/core/logging/SessionLog';
import { logForRequest } from '@/core/logging/sessionLogStore';
import { BenchmarkRequestSchema } from '@/modules/benchmark/application/dtos/BenchmarkRequest';
import { visitorKeysFrom } from '@/modules/benchmark/infrastructure/visitor-keys';
import { statusForFailedRun } from '@/modules/benchmark/application/use-cases/RunBenchmark';
import {
  benchmarkRepository,
  runBenchmarkUseCase,
  scoreRecordedBenchmarkUseCase,
} from '@/modules/benchmark/infrastructure/container';

// A benchmark runs real inference; it must never be statically evaluated at
// build time or cached.
export const dynamic = 'force-dynamic';

// Long runs are the normal case: iterations × per-request timeout. The route
// asks the platform for headroom rather than being killed mid-measurement.
export const maxDuration = 300;

export async function POST(request: Request) {
  // Null unless the caller sent a session header. No header, no record — the
  // default stays "we kept no record of what you ran".
  //
  // This route records because a benchmark run IS the event a session log
  // exists to hold. Until now only /comparisons wrote anything, so a user who
  // had benchmarked all day still saw an empty activity log.
  const log = logForRequest(request);

  // One id across every event this request produces, so an exported log can
  // be read as "these four lines were one thing the user did".
  const correlationId = randomUUID();
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation error',
        details: 'Body is not valid JSON.',
      },
      { status: 400 }
    );
  }

  // Validated BEFORE any provider is constructed or called — an invalid
  // request must never reach a model, and must never cost a token.
  const parsed = BenchmarkRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation error',
        details: parsed.error.errors,
      },
      { status: 400 }
    );
  }

  log?.record(
    'info',
    'benchmark',
    'Benchmark requested',
    {
      workload_id: parsed.data.workload_id,
      provider: parsed.data.provider,
      model: parsed.data.model ?? null,
      iterations: parsed.data.iterations ?? null,
      // A recorded run was measured by the visitor's browser against their
      // own Ollama; this server only scores it. Worth a line in the record,
      // because it is the difference between "this machine" and "theirs".
      measured_by: parsed.data.recorded ? 'browser' : 'server',
      local_host: parsed.data.recorded?.host ?? null,
      // Content is never stored; the digest proves two runs used the same
      // prompt without reproducing it.
      prompt: digestPrompt(parsed.data.prompt ?? '', log.includePromptText),
    },
    correlationId
  );

  try {
    const useCase = parsed.data.recorded
      ? scoreRecordedBenchmarkUseCase(parsed.data.recorded)
      : runBenchmarkUseCase(visitorKeysFrom(request));
    const outcome = await useCase.execute(parsed.data);

    if (!outcome.ok) {
      log?.record(
        'warn',
        'benchmark',
        `Benchmark not run: ${outcome.error}`,
        { detail: outcome.detail, status: outcome.status },
        correlationId
      );

      return NextResponse.json(
        { success: false, error: outcome.error, details: outcome.detail },
        { status: outcome.status }
      );
    }

    const { run } = outcome;

    // Every provider failed. The run is still returned: the fallback chain in
    // it is exactly what an operator needs to diagnose the failure.
    if (run.status === 'failed') {
      log?.record(
        'error',
        'benchmark',
        `Every provider failed for ${run.model}`,
        {
          requested_provider: run.requested_provider,
          model: run.model,
          // The whole chain, not just the last failure: which providers were
          // tried and why each one gave up is the diagnosis.
          fallback_chain: run.fallback_chain,
        },
        correlationId
      );

      return NextResponse.json(
        { success: false, error: 'All providers failed', data: run },
        { status: statusForFailedRun(run) }
      );
    }

    // The measurement itself, with the provenance that qualifies it. A log
    // that said only "a benchmark ran" would not be worth exporting.
    log?.record(
      'info',
      'benchmark',
      `Measured ${run.model} on ${run.effective_provider ?? run.requested_provider}`,
      {
        benchmark_id: run.benchmark_id,
        requested_provider: run.requested_provider,
        effective_provider: run.effective_provider,
        model: run.model,
        fallback_used: run.fallback_used,
        // Recorded rather than hidden: a figure produced by the demo adapter
        // must never be read later as a measurement of real hardware.
        simulated: run.simulated,
        iterations: run.results.length,
        summary: run.summary,
        cold_start_ms: run.cold_start?.latency_ms ?? null,
        readiness_score: run.readiness_score,
        // False when the run completed but the database refused it, which is
        // the difference between "no result" and "a result nobody kept".
        persisted: run.persisted,
        assumptions: run.assumptions,
        limitations: run.limitations,
      },
      correlationId
    );

    return NextResponse.json({
      success: true,
      data: run,
      meta: { session_logged: log !== null, correlation_id: correlationId },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Benchmark error:', error);

    log?.record(
      'error',
      'benchmark',
      'Benchmark failed with an unexpected error',
      { message: error instanceof Error ? error.message : 'unknown' },
      correlationId
    );

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const ListQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  benchmark_id: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const parsed = ListQuerySchema.safeParse({
      user_id: url.searchParams.get('user_id') ?? undefined,
      benchmark_id: url.searchParams.get('benchmark_id') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: parsed.error.errors,
        },
        { status: 400 }
      );
    }

    const repository = benchmarkRepository();

    if (parsed.data.benchmark_id) {
      const benchmark = await repository.findById(parsed.data.benchmark_id);

      if (benchmark === null) {
        return NextResponse.json(
          { success: false, error: 'Benchmark not found' },
          { status: 404 }
        );
      }

      const [results, readiness] = await Promise.all([
        repository.getResults(benchmark.id),
        repository.getReadinessScore(benchmark.id),
      ]);

      return NextResponse.json({
        success: true,
        data: { benchmark, results, readiness },
      });
    }

    // Without a session there is no "current user", and returning every row
    // in the table would leak other people's runs. An explicit owner is
    // required instead; the empty list keeps the scaffold's shape for any
    // caller that has not been updated yet.
    if (!parsed.data.user_id) {
      return NextResponse.json({
        success: true,
        data: [],
        message:
          'Provide ?user_id=<uuid> or ?benchmark_id=<uuid>. Session-derived listing is not ' +
          'available yet, and returning every benchmark would expose other users’ runs.',
      });
    }

    const benchmarks = await repository.findByUserId(parsed.data.user_id);

    return NextResponse.json({ success: true, data: benchmarks });
  } catch (error) {
    console.error('Get benchmarks error:', error);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
