import { normalizeVisionLabel } from '../core/normalization';
import { calculateVisionMetrics } from '../core/metrics';
import { VisionBenchmarkEvidenceSchema } from '../core/schemas';
import {
  VisionBenchmarkEvaluationInput,
  VisionBenchmarkEvidence,
  VisionBenchmarkThresholds,
  VisionPredictionRecord,
} from '../core/types';

export const DEFAULT_VISION_THRESHOLDS: VisionBenchmarkThresholds = {
  minimumAccuracy: 0.8,
  minimumMacroF1: 0.75,
  maximumInvalidOutputRate: 0.05,
  minimumSuccessfulRequestRate: 0.95,
};

function validateEvaluationInput(
  input: VisionBenchmarkEvaluationInput
): void {
  if (input.samples.length === 0) {
    throw new Error(
      'At least one benchmark sample is required.'
    );
  }

  if (input.samples.length !== input.responses.length) {
    throw new Error(
      'The number of responses must match the number of samples.'
    );
  }

  const sampleIds = input.samples.map((sample) => sample.id);

  if (new Set(sampleIds).size !== sampleIds.length) {
    throw new Error(
      'Duplicate sample identifiers are not allowed.'
    );
  }

  for (const sample of input.samples) {
    if (!sample.licenseVerified) {
      throw new Error(
        `Sample '${sample.id}' does not have a verified license.`
      );
    }

    if (!sample.privacyReviewed) {
      throw new Error(
        `Sample '${sample.id}' has not passed privacy review.`
      );
    }
  }

  for (const response of input.responses) {
    if (
      !Number.isFinite(response.latencyMs) ||
      response.latencyMs < 0
    ) {
      throw new Error(
        'Response latency must be a finite non-negative number.'
      );
    }
  }
}

function classifyError(
  success: boolean,
  normalizedLabel: string | null
): 'provider_error' | 'invalid_output' | null {
  if (!success) {
    return 'provider_error';
  }

  if (normalizedLabel === null) {
    return 'invalid_output';
  }

  return null;
}

export function evaluateVisionBenchmark(
  input: VisionBenchmarkEvaluationInput
): VisionBenchmarkEvidence {
  validateEvaluationInput(input);

  const thresholds: VisionBenchmarkThresholds = {
    ...DEFAULT_VISION_THRESHOLDS,
    ...input.thresholds,
  };

  const records: VisionPredictionRecord[] = input.samples.map(
    (sample, index) => {
      const response = input.responses[index];

      const normalizedLabel = response.success
        ? normalizeVisionLabel(response.rawOutput)
        : null;

      return {
        sampleId: sample.id,
        expectedLabel: sample.expectedLabel,
        rawOutput: response.rawOutput,
        normalizedLabel,
        latencyMs: response.latencyMs,
        providerSuccess: response.success,
        errorCategory: classifyError(
          response.success,
          normalizedLabel
        ),
      };
    }
  );

  const metrics = calculateVisionMetrics(records);

  const passed =
    metrics.exactMatchAccuracy >= thresholds.minimumAccuracy &&
    metrics.macroF1 >= thresholds.minimumMacroF1 &&
    metrics.invalidOutputRate <=
      thresholds.maximumInvalidOutputRate &&
    metrics.successfulRequestRate >=
      thresholds.minimumSuccessfulRequestRate;

  const evidence: VisionBenchmarkEvidence = {
    schemaVersion: '1.0.0',
    workloadId: 'construction-component-recognition-v1',
    workloadVersion: input.workloadVersion,
    datasetId: input.datasetId,
    manifestVersion: input.manifestVersion,
    manifestSha256: input.manifestSha256,
    preprocessingVersion: input.preprocessingVersion,
    promptVersion: input.promptVersion,
    executionMode: input.executionMode,
    provider: input.provider,
    providerKind: input.providerKind,
    model: input.model,
    deviceProfileId: input.deviceProfileId,
    gitCommitSha: input.gitCommitSha,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    records,
    metrics,
    thresholds,
    passed,
    limitations: input.limitations ?? [],
  };

  return VisionBenchmarkEvidenceSchema.parse(evidence);
}
