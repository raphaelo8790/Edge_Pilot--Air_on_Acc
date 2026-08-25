export interface Benchmark {
  id: string;
  workloadId: string;
  deviceId: string;
  providerId: string;
  model: string;
  prompt: string;
  iterations: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  userId: string;
  createdAt: Date;
  completedAt: Date | null;
}

export interface BenchmarkResult {
  id: string;
  benchmarkId: string;
  iteration: number;
  latencyMs: number;
  tokensPerSecond: number | null;
  ttftMs: number | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: Date;
}

export interface ReadinessScore {
  id: string;
  benchmarkId: string;
  hardwareFit: number;
  latencyScore: number;
  privacyScore: number;
  costScore: number;
  reliabilityScore: number;
  overallReadiness: number;
  recommendation: string;
  evidence: string[];
  limitations: string[];
  createdAt: Date;
}
