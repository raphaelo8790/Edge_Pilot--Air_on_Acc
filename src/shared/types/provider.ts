import { z } from 'zod';

export const ProviderSchema = z.object({
  provider_id: z.string().uuid(),
  name: z.enum(['ollama', 'gemini', 'groq']),
  type: z.enum(['local', 'cloud']),
  base_url: z.string().url().nullable(),
  is_active: z.boolean(),
});

export type Provider = z.infer<typeof ProviderSchema>;

export interface AIResponse {
  text: string;
  latency_ms: number;
  tokens_per_second: number | null;
  ttft_ms: number | null;
  success: boolean;
  error_message: string | null;
}

export interface ProviderBenchmarkResult {
  iteration: number;
  latency_ms: number;
  tokens_per_second: number | null;
  ttft_ms: number | null;
  success: boolean;
  error_message: string | null;
}

export interface AIProvider {
  name: string;
  type: 'local' | 'cloud';

  generate(
    prompt: string,
    model: string
  ): Promise<AIResponse>;

  benchmark(
    prompt: string,
    model: string,
    iterations: number
  ): Promise<ProviderBenchmarkResult[]>;
}
