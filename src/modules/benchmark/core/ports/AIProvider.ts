export interface AIProvider {
  name: string;
  type: 'local' | 'cloud';
  
  generate(prompt: string, model: string): Promise<AIResponse>;
  benchmark(prompt: string, model: string, iterations: number): Promise<BenchmarkResult[]>;
}

export interface AIResponse {
  text: string;
  latency_ms: number;
  tokens_per_second: number | null;
  ttft_ms: number | null;
  success: boolean;
  error_message: string | null;
}

export interface BenchmarkResult {
  iteration: number;
  latency_ms: number;
  tokens_per_second: number | null;
  ttft_ms: number | null;
  success: boolean;
  error_message: string | null;
}
