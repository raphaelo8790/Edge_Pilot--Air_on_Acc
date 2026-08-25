export interface Benchmark {
  id: string;
  workloadId: string;
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
  /** True for the discarded cold-start call. Never counted in an average. */
  warmup: boolean;
  createdAt: Date;
}

export interface ReadinessScore {
  id: string;
  benchmarkId: string;
  /** Null when hardware fit could not be assessed for this run. */
  hardwareFit: number | null;
  latencyScore: number;
  /**
   * Retained so historic rows keep their meaning. Always null for runs scored
   * after privacy became a class - see PrivacyAssessor.
   */
  privacyScore: number | null;
  /** Ordinal privacy class for this run, e.g. "on-device". */
  privacyClass: string | null;
  costScore: number;
  reliabilityScore: number;
  overallReadiness: number;
  recommendation: string;
  evidence: string[];
  limitations: string[];
  createdAt: Date;
}
