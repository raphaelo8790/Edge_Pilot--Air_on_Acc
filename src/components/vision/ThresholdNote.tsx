/**
 * What "passed" actually means.
 *
 * A pass/fail badge with no stated bar is close to meaningless — and this
 * project's own reference run FAILS its gate, which is only defensible if a
 * reader can see what the gate was. The numbers come from
 * DEFAULT_VISION_THRESHOLDS rather than being typed in here, so the text
 * cannot drift away from the rule the evaluator actually applies.
 */

import { DEFAULT_VISION_THRESHOLDS } from '@/modules/vision-benchmark/application/evaluator';
import type { VisionBenchmarkThresholds } from '@/modules/vision-benchmark/core/types';

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ThresholdNote({
  thresholds = DEFAULT_VISION_THRESHOLDS,
}: {
  thresholds?: VisionBenchmarkThresholds;
}) {
  return (
    <p className="card-sub">
      <strong>A run passes only if all four hold:</strong> accuracy at least{' '}
      {pct(thresholds.minimumAccuracy)}, macro F1 at least{' '}
      {thresholds.minimumMacroF1.toFixed(2)}, invalid output no more than{' '}
      {pct(thresholds.maximumInvalidOutputRate)}, and at least{' '}
      {pct(thresholds.minimumSuccessfulRequestRate)} of requests answered.
      Macro F1 is averaged per class, so a model that ignores one label
      entirely fails on it even when overall accuracy looks healthy.
    </p>
  );
}
