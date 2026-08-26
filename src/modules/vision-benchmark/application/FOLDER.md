# `src/modules/vision-benchmark/application/` - running and grading

**Work package:** vision benchmark.

## What this folder is

Four files: the executor that runs a workload sample by sample, the evaluator
that grades the result against thresholds, the dashboard projection, and the
provider port.

## What happened here

`executor.ts` grew from 159 to 222 lines, all of it for the warm-up
classification - and getting that right took three corrections worth recording,
because each one is a different class of mistake:

- It **consumed the deterministic test clock**, moving every timing in the
  suite. Fixed by calling `provider.classify()` directly rather than the timed
  `classifySample` wrapper.
- It **fired on cloud providers**, which meant a billable API call and one extra
  image sent to a third party on every run. Fixed: local providers only, plus an
  explicit `warmUp?: boolean` so a caller can always opt out.
- It **ate the first scripted response** in two existing tests. Those two now
  opt out with a comment explaining why, and two new tests cover the warm-up
  properly.

The warm-up's failure is swallowed on purpose: if the throwaway classification
errors, the measured run should still proceed.

The executor also threads `labels`, `datasetId` and `workloadId` through, which
is what lets a run be about a dataset other than the built-in one.

**Hosted-mode pass.** `executeVisionBenchmark` gained a `concurrency` option, default 1. Batches of that size are awaited in turn and each response is written to its sample's own slot, so a batch of one is the old sequential loop byte for byte. Cloud runs from the page use 7 to fit a serverless time limit; a local run stays at 1, because two requests to one GPU measure contention rather than the model.

## Files

| File | What it is |
|---|---|
| `executor.ts` | 223 lines. `executeVisionBenchmark`, the warm-up, the injected clock |
| `evaluator.ts` | 162 lines. `evaluateVisionBenchmark` and `DEFAULT_VISION_THRESHOLDS` - 0.80 accuracy, 0.75 macro-F1, 0.05 maximum invalid-output rate, 0.95 successful-request rate |
| `dashboard.ts` | 50 lines. `toVisionDashboardRow`, `rankVisionDashboardRows` |
| `provider.ts` | 29 lines. `VisionProvider` and `VisionImageProcessor` - the two ports the infrastructure layer implements |

## Connected folders

- [`../core/`](../core/FOLDER.md) - the types, metrics and thresholds.
- [`../infrastructure/`](../infrastructure/FOLDER.md) - the four provider and
  two processor implementations of these ports.
- [`tests/vision-benchmark/`](../../../../tests/vision-benchmark/FOLDER.md) -
  `vision-execution.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/vision-benchmark/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
