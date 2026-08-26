/**
 * POST /api/v1/comparisons — benchmark two or more models against each other.
 *
 * Returns three things, deliberately separated:
 *
 *   plan     what was decided before anything ran — whether the entrants are
 *            comparable at all, whether they had to run one after another,
 *            and why. A reader who disagrees with the verdict can check the
 *            method first.
 *   outcomes each run in full, unchanged, so nothing is only available in
 *            summarised form.
 *   report   per-dimension winners, each marked established or not.
 *
 * Nothing is written to the database. A comparison analyses runs; it is not a
 * new kind of record, and tying it to the write path would make a read-only
 * question depend on a workload row that may not exist.
 *
 * Status codes: 422 means the comparison was refused as meaningless (for
 * example a text model against an embedding model) rather than that it
 * failed — the body carries the plan explaining why.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RecordedMeasurementSchema } from '@/modules/benchmark/application/dtos/BenchmarkRequest';
import { visitorKeysFrom } from '@/modules/benchmark/infrastructure/visitor-keys';
import { parseParameterSize } from '@/modules/benchmark/application/dtos/LocalRuntime';
import { randomUUID } from 'node:crypto';
import {
  localModelCatalogue,
  runComparisonUseCase,
} from '@/modules/benchmark/infrastructure/container';
import { logForRequest } from '@/core/logging/sessionLogStore';
import { digestPrompt } from '@/core/logging/SessionLog';

export const dynamic = 'force-dynamic';

/**
 * One shape for the plan on every path. A refusal is not an error response
 * with less information in it - the caller needs the same entrant breakdown
 * to explain to the user why the pairing was rejected.
 */
function serialisePlan(plan: {
  mode: string;
  modeReason: string;
  modality: string | null;
  caveats: string[];
  entrants: Array<{
    provider: string;
    model: string;
    providerType: string;
    verdict: { modality: string; confidence: string; reason: string };
  }>;
}) {
  return {
    mode: plan.mode,
    mode_reason: plan.modeReason,
    modality: plan.modality,
    caveats: plan.caveats,
    entrants: plan.entrants.map((entrant) => ({
      provider: entrant.provider,
      model: entrant.model,
      provider_type: entrant.providerType,
      modality: entrant.verdict.modality,
      modality_confidence: entrant.verdict.confidence,
      modality_reason: entrant.verdict.reason,
    })),
  };
}

const EntrantSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  tier: z.enum(['local', 'free', 'paid', 'unknown']).optional(),
  families: z.array(z.string()).optional(),
  parametersBillions: z.number().positive().nullable().optional(),
  // Measured by the visitor's browser against its own Ollama. See
  // RecordedProvider for why the server scores rather than re-measures.
  recorded: RecordedMeasurementSchema.optional(),
});

const ComparisonSchema = z
  .object({
    entrants: z.array(EntrantSchema).min(2).max(4),
    prompt: z.string().min(1).max(4000),
    iterations: z.number().int().min(1).max(20),
  })
  .superRefine((value, context) => {
    value.entrants.forEach((entrant, index) => {
      if (!entrant.recorded) return;

      if (entrant.provider !== 'ollama') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entrants', index, 'recorded'],
          message: 'Only an ollama entrant can be recorded by the browser.',
        });
      }

      if (entrant.recorded.responses.length !== value.iterations + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entrants', index, 'recorded', 'responses'],
          message:
            'recorded.responses must hold iterations + 1 entries (the first is the cold start).',
        });
      }
    });
  });



export async function POST(request: Request) {
  // Null unless the caller sent a session header. No header, no record.
  const log = logForRequest(request);
  const correlationId = randomUUID();

  let parsed;

  try {
    parsed = ComparisonSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Malformed request body' },
      { status: 400 }
    );
  }

  log?.record(
    'info',
    'comparison',
    'Comparison requested',
    {
      entrants: parsed.entrants.map((entrant) => ({
        provider: entrant.provider,
        model: entrant.model,
        tier: entrant.tier ?? null,
      })),
      iterations: parsed.iterations,
      // Content is never stored; the digest proves two runs used the same
      // prompt without reproducing it.
      prompt: digestPrompt(parsed.prompt, log.includePromptText),
    },
    correlationId
  );

  try {
    // Modality is decided from the families the runtime reports, so look them
    // up rather than trusting the caller. A caller-supplied value still wins,
    // which is how a cloud entrant can declare what it is.
    let reported = new Map<
      string,
      { families: string[]; parametersBillions: number | null }
    >();

    try {
      const status = await localModelCatalogue().status();
      reported = new Map(
        status.models.map((model) => [
          model.name,
          {
            families: model.families,
            parametersBillions: parseParameterSize(model.parameterSize),
          },
        ])
      );
    } catch {
      reported = new Map();
    }

    const entrants = parsed.entrants.map((entrant) => {
      const known = reported.get(entrant.model);

      return {
        ...entrant,
        families: entrant.families ?? known?.families ?? undefined,
        parametersBillions:
          entrant.parametersBillions ?? known?.parametersBillions ?? null,
      };
    });

    const result = await runComparisonUseCase(visitorKeysFrom(request)).execute({
      entrants,
      prompt: parsed.prompt,
      iterations: parsed.iterations,
    });

    if (!result.ok) {
      log?.record(
        result.plan ? 'warn' : 'error',
        'comparison',
        `Comparison not run: ${result.error}`,
        { detail: result.detail, status: result.status },
        correlationId
      );

      return NextResponse.json(
        {
          success: false,
          error: result.error,
          details: result.detail,
          data: result.plan ? { plan: serialisePlan(result.plan) } : undefined,
        },
        { status: result.status }
      );
    }

    log?.record(
      'info',
      'comparison',
      `Ran ${result.outcomes.length} entrants ${result.plan.mode}`,
      {
        mode: result.plan.mode,
        mode_reason: result.plan.modeReason,
        modality: result.plan.modality,
        caveats: result.plan.caveats,
      },
      correlationId
    );

    for (const entry of result.outcomes) {
      log?.record(
        'info',
        'benchmark',
        `Measured ${entry.label}`,
        {
          entrant: entry.label,
          effective_provider: entry.outcome.effectiveProvider,
          fallback_used: entry.outcome.fallbackUsed,
          simulated: entry.outcome.simulated,
          summary: entry.outcome.summary,
          readiness: entry.outcome.readinessScore,
          hardware_state: entry.outcome.hardware?.state ?? null,
          privacy_class: entry.outcome.privacy?.privacyClass ?? null,
        },
        correlationId
      );
    }

    // The verdict is logged with its uncertainty codes, so an exported log
    // shows not just who won but which rows were actually demonstrated.
    log?.record(
      'info',
      'comparison',
      result.report.overall.summary,
      {
        established: result.report.overall.established,
        tally: result.report.overall.tally,
        dimensions: result.report.dimensions.map((dimension) => ({
          dimension: dimension.dimension,
          code: dimension.code,
          winner: dimension.winner,
          established: dimension.established,
          separability: dimension.separability,
        })),
        privacy_notes: result.report.privacyNotes,
      },
      correlationId
    );

    return NextResponse.json({
      success: true,
      data: {
        session_logged: log !== null,
        correlation_id: correlationId,
        plan: serialisePlan(result.plan),
        report: result.report,
        outcomes: result.outcomes,
      },
    });
  } catch (error) {
    console.error('Comparison error:', error);

    log?.record(
      'error',
      'comparison',
      'Comparison failed with an unexpected error',
      { message: error instanceof Error ? error.message : 'unknown' },
      correlationId
    );

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
