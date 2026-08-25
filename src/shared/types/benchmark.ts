import { z } from 'zod';

// Benchmark Request Schema
export const BenchmarkRequestSchema = z.object({
  workload_id: z.string().uuid(),
  device_id: z.string().uuid(),
  provider: z.enum(['ollama', 'gemini', 'groq']),
  model: z.string().min(1),
  prompt: z.string().min(1).max(10000),
  iterations: z.number().int().min(1).max(100),
});

export type BenchmarkRequest = z.infer<typeof BenchmarkRequestSchema>;

// Benchmark Result Schema
export const BenchmarkResultSchema = z.object({
  benchmark_id: z.string().uuid(),
  workload_id: z.string().uuid(),
  device_id: z.string().uuid(),
  provider: z.string(),
  model: z.string(),
  latency_ms: z.number(),
  tokens_per_second: z.number().nullable(),
  ttft_ms: z.number().nullable(),
  success: z.boolean(),
  error_message: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;

// Readiness Score Schema
export const ReadinessScoreSchema = z.object({
  readiness_id: z.string().uuid(),
  workload_id: z.string().uuid(),
  device_id: z.string().uuid(),
  hardware_fit: z.number().min(0).max(100),
  latency_score: z.number().min(0).max(100),
  privacy_score: z.number().min(0).max(100),
  cost_score: z.number().min(0).max(100),
  reliability_score: z.number().min(0).max(100),
  overall_readiness: z.number().min(0).max(100),
  recommendation: z.string(),
  evidence: z.array(z.string()),
  limitations: z.array(z.string()),
});

export type ReadinessScore = z.infer<typeof ReadinessScoreSchema>;
