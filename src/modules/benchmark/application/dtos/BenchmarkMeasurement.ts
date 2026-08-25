/**
 * The typed measurement envelope.
 *
 * `BenchmarkRequestSchema` (in BenchmarkRequest.ts) validates what comes IN.
 * This file validates what goes OUT, and is the reason a reader can tell a
 * measurement from a derivation from a placeholder.
 *
 * It is deliberately a superset of `BenchmarkResponseSchema` rather than a
 * replacement: the existing response shape is what the dashboard is being
 * written against, so it keeps every field it already had, in the same place,
 * with the same name. Everything added here is additive.
 */

import { z } from 'zod';

export const MeasurementStatusSchema = z.enum([
  'measured',
  'derived',
  'unavailable',
  'simulated',
]);

export const ProviderErrorCodeSchema = z.enum([
  'timeout',
  'local_unavailable',
  'invalid_model',
  'unauthorized',
  'rate_limited',
  'invalid_response',
  'not_configured',
  'provider_error',
]);

/**
 * One iteration. `latency_ms` is always present — a failed call still took
 * time, and how long it took to fail is evidence.
 */
export const MeasuredIterationSchema = z.object({
  iteration: z.number().int().positive(),
  provider: z.string().min(1),
  model: z.string().min(1),
  latency_ms: z.number().nonnegative(),
  ttft_ms: z.number().nonnegative().nullable(),
  tokens_per_second: z.number().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  input_tokens: z.number().int().nonnegative().nullable(),
  success: z.boolean(),
  error_code: ProviderErrorCodeSchema.nullable(),
  error_message: z.string().nullable(),
  provenance: z.object({
    latency_ms: MeasurementStatusSchema,
    ttft_ms: MeasurementStatusSchema,
    tokens_per_second: MeasurementStatusSchema,
    output_tokens: MeasurementStatusSchema,
  }),
});

export type MeasuredIteration = z.infer<typeof MeasuredIterationSchema>;

/**
 * Aggregates. Every one of them is nullable, because with zero successful
 * iterations there is no average latency — and reporting 0 ms for "we never
 * got an answer" is the single most misleading number this system could
 * produce.
 */
export const MeasurementSummarySchema = z.object({
  iterations_requested: z.number().int().positive(),
  iterations_run: z.number().int().nonnegative(),
  iterations_succeeded: z.number().int().nonnegative(),
  success_rate_percent: z.number().min(0).max(100),
  latency_ms_mean: z.number().nonnegative().nullable(),
  latency_ms_min: z.number().nonnegative().nullable(),
  latency_ms_max: z.number().nonnegative().nullable(),
  /** p50 by nearest-rank; with fewer than 3 successes it is not reported. */
  latency_ms_p50: z.number().nonnegative().nullable(),
  ttft_ms_mean: z.number().nonnegative().nullable(),
  tokens_per_second_mean: z.number().nonnegative().nullable(),
  output_tokens_total: z.number().int().nonnegative().nullable(),
});

export type MeasurementSummary = z.infer<typeof MeasurementSummarySchema>;

export const FallbackAttemptSchema = z.object({
  provider: z.string().min(1),
  outcome: z.enum(['succeeded', 'failed', 'skipped']),
  error_code: ProviderErrorCodeSchema.nullable(),
  detail: z.string(),
});

export type FallbackAttempt = z.infer<typeof FallbackAttemptSchema>;

/**
 * The full result of one benchmark run.
 *
 * `assumptions` is not decoration. The acceptance criteria require that every
 * recommendation shows measured evidence and marks unmeasured claims as
 * assumptions; the readiness score mixes measured latency and reliability
 * with a hardware-fit and a cost figure that nobody has measured yet, so each
 * of those has to travel with the score that used it.
 */
export const BenchmarkRunSchema = z.object({
  benchmark_id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  requested_provider: z.string().min(1),
  /** The provider that actually produced the results, after any fallback. */
  effective_provider: z.string().min(1).nullable(),
  model: z.string().min(1),
  fallback_used: z.boolean(),
  fallback_chain: z.array(FallbackAttemptSchema),
  /** True when any figure came from the simulated demo adapter. */
  simulated: z.boolean(),
  results: z.array(MeasuredIterationSchema),
  summary: MeasurementSummarySchema,
  readiness_score: z.number().min(0).max(100).nullable(),
  recommendation: z.string(),
  evidence: z.array(z.string()),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  /** False when the run completed but could not be written to the database. */
  persisted: z.boolean(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
});

export type BenchmarkRun = z.infer<typeof BenchmarkRunSchema>;

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return Number((total / values.length).toFixed(3));
}

function percentile(values: number[], fraction: number): number | null {
  // Nearest-rank. Below three samples a percentile says nothing that min and
  // max do not already say, so it is withheld rather than computed.
  if (values.length < 3) {
    return null;
  }

  const sorted = values.slice().sort((first, second) => first - second);
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));

  return Number(sorted[index].toFixed(3));
}

export function summarise(
  results: MeasuredIteration[],
  iterationsRequested: number
): MeasurementSummary {
  const successes = results.filter((result) => result.success);
  const latencies = successes.map((result) => result.latency_ms);
  const ttfts = successes
    .map((result) => result.ttft_ms)
    .filter((value): value is number => value !== null);
  const throughputs = successes
    .map((result) => result.tokens_per_second)
    .filter((value): value is number => value !== null);
  const outputTokens = successes
    .map((result) => result.output_tokens)
    .filter((value): value is number => value !== null);

  return {
    iterations_requested: iterationsRequested,
    iterations_run: results.length,
    iterations_succeeded: successes.length,
    success_rate_percent:
      results.length === 0
        ? 0
        : Number(((successes.length / results.length) * 100).toFixed(2)),
    latency_ms_mean: mean(latencies),
    latency_ms_min:
      latencies.length === 0 ? null : Number(Math.min(...latencies).toFixed(3)),
    latency_ms_max:
      latencies.length === 0 ? null : Number(Math.max(...latencies).toFixed(3)),
    latency_ms_p50: percentile(latencies, 0.5),
    ttft_ms_mean: mean(ttfts),
    tokens_per_second_mean: mean(throughputs),
    output_tokens_total:
      outputTokens.length === 0
        ? null
        : outputTokens.reduce((sum, value) => sum + value, 0),
  };
}
