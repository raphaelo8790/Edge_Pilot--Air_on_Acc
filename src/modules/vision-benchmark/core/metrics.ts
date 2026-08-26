import {
  ClassMetrics,
  VISION_LABELS,
  VisionAggregateMetrics,
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
  label: string
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


/**
 * Median of whatever the runtime actually reported, or null.
 *
 * Null when nothing reported, never 0. A provider that returns no timings and
 * a model that answered instantly must not produce the same number — that is
 * the same rule the benchmark layer applies to every nullable aggregate.
 */
function medianOrNull(values: number[]): number | null {
  return values.length === 0 ? null : median(values);
}

/**
 * Aggregates of what the RUNTIME reported, not of our own clock.
 *
 * Only successful records contribute: a failed request's timings describe a
 * failure, not the model. Every result is null when nothing reported it —
 * never 0, which would read as "instant" rather than "not measured".
 */
function runtimeAggregates(records: VisionPredictionRecord[]): {
  medianPromptEvalMs: number | null;
  medianTokensPerSecond: number | null;
  outputTokensTotal: number | null;
  modelLoadMs: number | null;
} {
  const runtimes = records
    .filter((record) => record.providerSuccess)
    .map((record) => record.runtime)
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const promptEval = runtimes
    .map((entry) => entry.promptEvalMs)
    .filter((value): value is number => typeof value === 'number');

  const tokensPerSecond = runtimes
    .map((entry) =>
      typeof entry.outputTokens === 'number' &&
      typeof entry.evalMs === 'number' &&
      entry.evalMs > 0
        ? entry.outputTokens / (entry.evalMs / 1000)
        : null
    )
    .filter((value): value is number => typeof value === 'number');

  const outputTokens = runtimes
    .map((entry) => entry.outputTokens)
    .filter((value): value is number => typeof value === 'number');

  const loads = runtimes
    .map((entry) => entry.loadMs)
    .filter((value): value is number => typeof value === 'number');

  return {
    medianPromptEvalMs: medianOrNull(promptEval),
    medianTokensPerSecond: medianOrNull(tokensPerSecond),
    outputTokensTotal:
      outputTokens.length === 0
        ? null
        : outputTokens.reduce((total, value) => total + value, 0),
    // The largest load seen. The warm-up is discarded before these records
    // exist, so anything big here means the runtime evicted the model
    // mid-run and paid to read it back off disk.
    modelLoadMs: loads.length === 0 ? null : Math.max(...loads),
  };
}

export function calculateVisionMetrics(
  records: VisionPredictionRecord[],
  labels: readonly string[] = VISION_LABELS
): VisionAggregateMetrics {
  // Over the dataset's declared labels, not the ones that happen to appear in
  // the records. A class the model never predicted still belongs in the matrix
  // with zero recall - dropping it would quietly inflate the macro average.
  const perClass = labels.map((label) =>
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
    ...runtimeAggregates(records),
  };
}
