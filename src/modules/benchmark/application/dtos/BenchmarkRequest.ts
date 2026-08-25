import { z } from 'zod';

export const BenchmarkRequestSchema = z.object({
  workload_id: z.string().uuid(),
  device_id: z.string().uuid(),
  provider: z.enum(['ollama', 'gemini', 'groq']),
  model: z.string().min(1),
  prompt: z.string().min(1).max(10000),
  iterations: z.number().int().min(1).max(100),
});

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
