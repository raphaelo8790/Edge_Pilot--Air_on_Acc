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

export type VisionLabel = (typeof VISION_LABELS)[number];
export type VisionProviderKind = 'local' | 'cloud';
export type VisionExecutionMode = 'controlled' | 'live';

export interface VisionBenchmarkSample {
  id: string;
  imagePath: string;
  expectedLabel: VisionLabel;
  sourceId: string;
  licenseSpdx: 'MIT';
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

export interface VisionProviderResponse {
  rawOutput: string;
  latencyMs: number;
  success: boolean;
  errorMessage: string | null;
}

export interface VisionPredictionRecord {
  sampleId: string;
  expectedLabel: VisionLabel;
  rawOutput: string;
  normalizedLabel: VisionLabel | null;
  latencyMs: number;
  providerSuccess: boolean;
  errorCategory: 'provider_error' | 'invalid_output' | null;
}

export interface ClassMetrics {
  label: VisionLabel;
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
}

export interface VisionBenchmarkThresholds {
  minimumAccuracy: number;
  minimumMacroF1: number;
  maximumInvalidOutputRate: number;
  minimumSuccessfulRequestRate: number;
}

export interface VisionBenchmarkEvidence {
  schemaVersion: '1.0.0';
  workloadId: typeof VISION_WORKLOAD_ID;
  workloadVersion: string;
  datasetId: typeof VISION_DATASET_ID;
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
}

export interface VisionBenchmarkEvaluationInput {
  workloadVersion: string;
  datasetId: typeof VISION_DATASET_ID;
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
  workloadId: typeof VISION_WORKLOAD_ID;
  datasetId: typeof VISION_DATASET_ID;
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
