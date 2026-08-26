import { z } from 'zod';

const MeasurementStatusSchema = z.enum([
  'measured',
  'derived',
  'unavailable',
  'simulated',
]);

const ProviderErrorCodeSchema = z.enum([
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
 * One iteration as the browser measured it against the visitor's own Ollama.
 * Mirrors `MeasuredResponse` field for field; the server re-derives nothing
 * from `text` beyond what the adapter already derived, so it is bounded.
 */
export const RecordedResponseSchema = z.object({
  text: z.string().max(50_000),
  latency_ms: z.number().nonnegative(),
  tokens_per_second: z.number().nonnegative().nullable(),
  ttft_ms: z.number().nonnegative().nullable(),
  success: z.boolean(),
  error_message: z.string().max(2000).nullable(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    providerReportedDurationMs: z.number().nonnegative().nullable(),
  }),
  provenance: z.object({
    latencyMs: MeasurementStatusSchema,
    ttftMs: MeasurementStatusSchema,
    tokensPerSecond: MeasurementStatusSchema,
    outputTokens: MeasurementStatusSchema,
  }),
  failureCode: ProviderErrorCodeSchema.nullable(),
});

const HardwareObservationSchema = z.object({
  modelBytesOnDisk: z.number().nonnegative().nullable(),
  residentBytes: z.number().nonnegative().nullable(),
  vramBytes: z.number().nonnegative().nullable(),
});

/**
 * A run the BROWSER already performed against the visitor's local Ollama.
 *
 * WHY THIS EXISTS. Once the app is hosted, "localhost" on the server is a
 * machine in a datacentre with no Ollama in it. The only Ollama that can be
 * measured is the visitor's, and the only thing that can reach it is their
 * browser tab. So the tab measures, and sends the measurements here to be
 * scored, recorded and logged exactly as a server-side run would be.
 *
 * `responses` is `iterations + 1` long: the first is the discarded cold
 * start, the same convention BenchmarkRunner uses when it measures itself.
 */
export const RecordedMeasurementSchema = z.object({
  /** Where the tab sent its requests. A LAN or loopback address; not a secret. */
  host: z.string().url().max(200),
  responses: z.array(RecordedResponseSchema).min(1).max(101),
  /** Residency read before and after the run, or null when /api/ps could not be read. */
  resident_before: HardwareObservationSchema.nullable(),
  resident_after: HardwareObservationSchema.nullable(),
});

export type RecordedMeasurement = z.infer<typeof RecordedMeasurementSchema>;

export const BenchmarkRequestSchema = z
  .object({
    workload_id: z.string().uuid(),
    provider: z.enum(['ollama', 'gemini', 'groq']),
    model: z.string().min(1),
    prompt: z.string().min(1).max(10000),
    iterations: z.number().int().min(1).max(100),
    recorded: RecordedMeasurementSchema.optional(),
  })
  .refine(
    (value) => value.recorded === undefined || value.provider === 'ollama',
    {
      message:
        'Only an ollama run can be recorded by the browser; cloud providers are measured server-side.',
      path: ['recorded'],
    }
  )
  .refine(
    (value) =>
      value.recorded === undefined ||
      value.recorded.responses.length === value.iterations + 1,
    {
      message:
        'recorded.responses must hold iterations + 1 entries (the first is the cold start).',
      path: ['recorded', 'responses'],
    }
  );

export type BenchmarkRequest = z.infer<typeof BenchmarkRequestSchema>;

export const BenchmarkResponseSchema = z.object({
  benchmark_id: z.string().uuid(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  results: z.array(z.object({
    iteration: z.number(),
    latency_ms: z.number(),
    tokens_per_second: z.number().nullable(),
    ttft_ms: z.number().nullable(),
    success: z.boolean(),
  })),
  readiness_score: z.number().min(0).max(100),
  recommendation: z.string(),
});

export type BenchmarkResponse = z.infer<typeof BenchmarkResponseSchema>;
