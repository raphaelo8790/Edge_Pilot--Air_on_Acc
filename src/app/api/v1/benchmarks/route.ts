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

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BenchmarkRequestSchema } from '@/modules/benchmark/application/dtos/BenchmarkRequest';
import { statusForFailedRun } from '@/modules/benchmark/application/use-cases/RunBenchmark';
import {
  benchmarkRepository,
  runBenchmarkUseCase,
} from '@/modules/benchmark/infrastructure/container';

// A benchmark runs real inference; it must never be statically evaluated at
// build time or cached.
export const dynamic = 'force-dynamic';

// Long runs are the normal case: iterations × per-request timeout. The route
// asks the platform for headroom rather than being killed mid-measurement.
export const maxDuration = 300;

export async function POST(request: Request) {
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

  try {
    const outcome = await runBenchmarkUseCase().execute(parsed.data);

    if (!outcome.ok) {
      return NextResponse.json(
        { success: false, error: outcome.error, details: outcome.detail },
        { status: outcome.status }
      );
    }

    const { run } = outcome;

    // Every provider failed. The run is still returned: the fallback chain in
    // it is exactly what an operator needs to diagnose the failure.
    if (run.status === 'failed') {
      return NextResponse.json(
        { success: false, error: 'All providers failed', data: run },
        { status: statusForFailedRun(run) }
      );
    }

    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Benchmark error:', error);

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
