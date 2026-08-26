export const VISION_LABELS = [
  'hardhat',
  'safety_vest',
  'gloves',
  'goggles',
  'mask',
  'ladder',
  'safety_cone',
] as const;

export const VISION_WORKLOAD_ID =
  'construction-component-recognition-v1' as const;

export const VISION_DATASET_ID =
  'edgepilot-synthetic-construction-components-v1' as const;

/**
 * The seven built-in construction-safety classes.
 *
 * WIDENED. Labels used to be this union everywhere, which meant a dataset
 * could only ever be about construction PPE - a user bringing their own images
 * had no way to say what they were of. Labels are now plain strings chosen by
 * whoever defines the dataset, and the SET of labels for a run travels on the
 * evidence, so the per-class matrix can still include a class that received no
 * predictions at all (which is exactly the class you most want to see).
 *
 * This type is kept because the built-in workload, its prompt and its manifest
 * are still about these seven, and narrowing them there is worth doing.
 */
export type VisionLabel = (typeof VISION_LABELS)[number];
export type VisionProviderKind = 'local' | 'cloud';
export type VisionExecutionMode = 'controlled' | 'live';

export interface VisionBenchmarkSample {
  id: string;
  imagePath: string;
  /** Dataset-defined. The built-in manifest uses VisionLabel values. */
  expectedLabel: string;
  sourceId: string;
  /** SPDX identifier, e.g. "MIT" or "CC-BY-4.0". Declared, not verified. */
  licenseSpdx: string;
  licenseVerified: boolean;
  privacyReviewed: boolean;
  containsPeople: boolean;
  containsFaces: boolean;
  containsPersonalData: boolean;
  exifPresent: boolean;
  sha256: string;
}

export interface PreparedVisionImage {
  data: Uint8Array;
  mimeType: 'image/png';
  width: number;
  height: number;
  sourceBytes: number;
  processedBytes: number;
  sourceSha256: string;
  processedSha256: string;
}

/**
 * Timings the RUNTIME reports for one request, in milliseconds.
 *
 * These are not our stopwatch. Ollama returns them on every /api/chat reply,
 * in nanoseconds, and they describe what happened inside the server rather
 * than what the network and our own code added around it. Every field is
 * nullable because a provider that does not report them (Gemini) must produce
 * `null`, never a zero — a zero here would read as "instant".
 *
 * WHY THERE IS NO time-to-first-token FIELD. TTFT is the gap between the
 * request and the first token appearing, and it can only be observed while
 * streaming. This provider sends `stream: false`, so the first byte and the
 * last byte arrive together and there is no first-token moment to time.
 * `promptEvalMs` is the closest honest thing: the time the runtime spent
 * consuming the prompt and the image before it began generating. Related, and
 * not the same number, so it does not borrow the name.
 */
export interface VisionRuntimeTiming {
  /** Total time inside the runtime, its own measurement. */
  totalMs: number | null;
  /** Time spent loading the model. Large here means a cold start. */
  loadMs: number | null;
  /** Time consuming the prompt and image before generation began. */
  promptEvalMs: number | null;
  /** Tokens of prompt consumed, image tokens included. */
  promptTokens: number | null;
  /** Time spent generating. */
  evalMs: number | null;
  /** Tokens generated. */
  outputTokens: number | null;
}

/**
 * How the model sat in memory during the run, as reported by the runtime.
 *
 * Deliberately a local shape rather than an import of the benchmark module's
 * HardwareFitAssessment: the two modules stay independent, the same way
 * http.ts is a copy rather than a shared import. The composition layer maps
 * one to the other.
 */
export interface VisionHardwareFit {
  state: string;
  /** Bytes resident in total, and how many of those were on the GPU. */
  residentBytes: number | null;
  vramBytes: number | null;
  /** Resident bytes that did not fit on the GPU. Null when unknowable. */
  spilledBytes: number | null;
  /** Plain sentence for a reader; never a bare number. */
  summary: string;
}

export interface VisionProviderResponse {
  rawOutput: string;
  /** Our wall clock, round trip. Includes network and our own overhead. */
  latencyMs: number;
  success: boolean;
  errorMessage: string | null;
  /** Null when the provider reports no timings of its own. */
  runtime?: VisionRuntimeTiming | null;
}

export interface VisionPredictionRecord {
  sampleId: string;
  /** Dataset-defined. The built-in manifest uses VisionLabel values. */
  expectedLabel: string;
  rawOutput: string;
  normalizedLabel: string | null;
  latencyMs: number;
  providerSuccess: boolean;
  errorCategory: 'provider_error' | 'invalid_output' | null;
  /** Optional so evidence written before this existed still parses. */
  runtime?: VisionRuntimeTiming | null;
}

export interface ClassMetrics {
  /**
   * Dataset-defined, matching VisionAggregateMetricsSchema.
   *
   * The last of the label narrowings. Per-class metrics are built from the
   * label set the run declared, so pinning this to the built-in seven would
   * mean a user's dataset could be measured but not described.
   */
  label: string;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface VisionAggregateMetrics {
  totalSamples: number;
  correctPredictions: number;
  exactMatchAccuracy: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  invalidOutputRate: number;
  successfulRequestRate: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  throughputSamplesPerSecond: number;
  perClass: ClassMetrics[];
  /**
   * Runtime-reported aggregates. All nullable and all optional: a provider
   * that reports nothing gives null, and evidence recorded before these
   * existed simply omits them.
   */
  medianPromptEvalMs?: number | null;
  medianTokensPerSecond?: number | null;
  outputTokensTotal?: number | null;
  modelLoadMs?: number | null;
}

export interface VisionBenchmarkThresholds {
  minimumAccuracy: number;
  minimumMacroF1: number;
  maximumInvalidOutputRate: number;
  minimumSuccessfulRequestRate: number;
}

export interface VisionBenchmarkEvidence {
  schemaVersion: '1.0.0';
  /** The built-in workload uses VISION_WORKLOAD_ID; uploads name their own. */
  workloadId: string;
  workloadVersion: string;
  datasetId: string;
  manifestVersion: string;
  manifestSha256: string;
  preprocessingVersion: string;
  promptVersion: string;
  executionMode: VisionExecutionMode;
  provider: string;
  providerKind: VisionProviderKind;
  model: string;
  deviceProfileId: string;
  gitCommitSha: string;
  startedAt: string;
  completedAt: string;
  records: VisionPredictionRecord[];
  metrics: VisionAggregateMetrics;
  thresholds: VisionBenchmarkThresholds;
  passed: boolean;
  limitations: string[];
  /**
   * Every class this dataset can produce, in order.
   *
   * Optional so that evidence written before datasets could define their own
   * labels still parses - readers fall back to VISION_LABELS. It is not
   * derivable from the records: a class with zero predictions and zero samples
   * would vanish from a per-class matrix that inferred its classes, and a
   * class the model never once predicted is precisely the interesting one.
   */
  labels?: readonly string[];
  /**
   * How the model sat in memory during this run. Optional so evidence written
   * before this existed still parses; null when the provider runs on someone
   * else's hardware or the runtime reported nothing.
   */
  hardwareFit?: VisionHardwareFit | null;
}

export interface VisionBenchmarkEvaluationInput {
  workloadVersion: string;
  datasetId: string;
  /** Defaults to VISION_LABELS when the dataset does not define its own. */
  labels?: readonly string[];
  /** Defaults to VISION_WORKLOAD_ID. */
  workloadId?: string;
  manifestVersion: string;
  manifestSha256: string;
  preprocessingVersion: string;
  promptVersion: string;
  executionMode: VisionExecutionMode;
  provider: string;
  providerKind: VisionProviderKind;
  model: string;
  deviceProfileId: string;
  gitCommitSha: string;
  startedAt: string;
  completedAt: string;
  samples: VisionBenchmarkSample[];
  responses: VisionProviderResponse[];
  thresholds?: Partial<VisionBenchmarkThresholds>;
  limitations?: string[];
}

export interface VisionDashboardRow {
  // Widened alongside VisionBenchmarkEvidence and VisionDashboardRowSchema.
  // A row can come from a dataset the user brought, which names itself; these
  // were the last two places still asserting that every result on the
  // dashboard is about construction safety.
  workloadId: string;
  datasetId: string;
  provider: string;
  providerKind: VisionProviderKind;
  model: string;
  executionMode: VisionExecutionMode;
  sampleCount: number;
  accuracy: number;
  macroF1: number;
  invalidOutputRate: number;
  successfulRequestRate: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  throughputSamplesPerSecond: number;
  passed: boolean;
  completedAt: string;
}
