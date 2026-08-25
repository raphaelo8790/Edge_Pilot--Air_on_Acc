import {
  ClassMetrics,
  VISION_LABELS,
  VisionAggregateMetrics,
  VisionLabel,
  VisionPredictionRecord,
} from './types';

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function nearestRankPercentile(
  values: number[],
  percentile: number
): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));

  return sorted[rank - 1];
}

function calculateClassMetrics(
  records: VisionPredictionRecord[],
  label: VisionLabel
): ClassMetrics {
  const truePositive = records.filter(
    (record) =>
      record.expectedLabel === label &&
      record.normalizedLabel === label
  ).length;

  const falsePositive = records.filter(
    (record) =>
      record.expectedLabel !== label &&
      record.normalizedLabel === label
  ).length;

  const falseNegative = records.filter(
    (record) =>
      record.expectedLabel === label &&
      record.normalizedLabel !== label
  ).length;

  const support = records.filter(
    (record) => record.expectedLabel === label
  ).length;

  const precision = safeDivide(
    truePositive,
    truePositive + falsePositive
  );

  const recall = safeDivide(
    truePositive,
    truePositive + falseNegative
  );

  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);

  return {
    label,
    truePositive,
    falsePositive,
    falseNegative,
    precision,
    recall,
    f1,
    support,
  };
}

export function calculateVisionMetrics(
  records: VisionPredictionRecord[]
): VisionAggregateMetrics {
  const perClass = VISION_LABELS.map((label) =>
    calculateClassMetrics(records, label)
  );

  const representedClasses = perClass.filter(
    (classMetrics) => classMetrics.support > 0
  );

  const correctPredictions = records.filter(
    (record) =>
      record.normalizedLabel !== null &&
      record.normalizedLabel === record.expectedLabel
  ).length;

  const invalidOutputs = records.filter(
    (record) =>
      record.providerSuccess && record.normalizedLabel === null
  ).length;

  const successfulRequests = records.filter(
    (record) => record.providerSuccess
  ).length;

  const latencies = records
    .filter((record) => record.providerSuccess)
    .map((record) => record.latencyMs);

  const totalMeasuredLatencyMs = latencies.reduce(
    (sum, latency) => sum + latency,
    0
  );

  return {
    totalSamples: records.length,
    correctPredictions,
    exactMatchAccuracy: safeDivide(
      correctPredictions,
      records.length
    ),
    macroPrecision: mean(
      representedClasses.map((item) => item.precision)
    ),
    macroRecall: mean(
      representedClasses.map((item) => item.recall)
    ),
    macroF1: mean(
      representedClasses.map((item) => item.f1)
    ),
    invalidOutputRate: safeDivide(
      invalidOutputs,
      records.length
    ),
    successfulRequestRate: safeDivide(
      successfulRequests,
      records.length
    ),
    medianLatencyMs: median(latencies),
    p95LatencyMs: nearestRankPercentile(latencies, 0.95),
    throughputSamplesPerSecond:
      totalMeasuredLatencyMs === 0
        ? 0
        : successfulRequests / (totalMeasuredLatencyMs / 1000),
    perClass,
  };
}