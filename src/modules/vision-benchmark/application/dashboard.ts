import {
  VisionBenchmarkEvidenceSchema,
  VisionDashboardRowSchema,
} from '../core/schemas';
import {
  VisionBenchmarkEvidence,
  VisionDashboardRow,
} from '../core/types';

export function toVisionDashboardRow(
  unvalidatedEvidence: VisionBenchmarkEvidence
): VisionDashboardRow {
  const evidence = VisionBenchmarkEvidenceSchema.parse(
    unvalidatedEvidence
  );

  return VisionDashboardRowSchema.parse({
    workloadId: evidence.workloadId,
    datasetId: evidence.datasetId,
    provider: evidence.provider,
    providerKind: evidence.providerKind,
    model: evidence.model,
    executionMode: evidence.executionMode,
    sampleCount: evidence.metrics.totalSamples,
    accuracy: evidence.metrics.exactMatchAccuracy,
    macroF1: evidence.metrics.macroF1,
    invalidOutputRate: evidence.metrics.invalidOutputRate,
    successfulRequestRate: evidence.metrics.successfulRequestRate,
    medianLatencyMs: evidence.metrics.medianLatencyMs,
    p95LatencyMs: evidence.metrics.p95LatencyMs,
    throughputSamplesPerSecond:
      evidence.metrics.throughputSamplesPerSecond,
    passed: evidence.passed,
    completedAt: evidence.completedAt,
  });
}

export function rankVisionDashboardRows(
  rows: VisionDashboardRow[]
): VisionDashboardRow[] {
  return [...rows].sort(
    (left, right) =>
      Number(right.passed) - Number(left.passed) ||
      right.accuracy - left.accuracy ||
      right.macroF1 - left.macroF1 ||
      left.p95LatencyMs - right.p95LatencyMs ||
      left.provider.localeCompare(right.provider)
  );
}
