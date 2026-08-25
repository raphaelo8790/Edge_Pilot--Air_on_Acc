# `src/modules/benchmark/application/dtos/` - what goes in, what comes out

**Work package:** benchmark and provider layer.

## What this folder is

Two files. `BenchmarkRequest.ts` validates what comes **in**.
`BenchmarkMeasurement.ts` validates what goes **out**, and is the reason a
reader can tell a measurement from a derivation from a placeholder.

## What happened here

`BenchmarkMeasurement.ts` grew by 38 differing lines to carry the cold start as
a first-class object rather than a footnote: `ColdStart` and `ColdStartSchema`
exist so the discarded iteration has a name, a duration and a row of its own.

It is deliberately a **superset** of the scaffold's `BenchmarkResponseSchema`
rather than a replacement. The dashboard was already being written against the
existing response shape, so every field it had is still there, in the same
place, with the same name, and everything new was added inside. That is why
`src/shared/types/benchmark.ts` needed only three lines changed.

## Files

| File | What it is |
|---|---|
| `BenchmarkMeasurement.ts` | 227 lines. `MeasuredIteration`, `MeasurementSummary`, `ColdStart`, `FallbackAttempt`, `BenchmarkRun`, `MeasurementStatus`, `ProviderErrorCode`, and `summarise()` - the function where a number would be invented if anywhere |
| `BenchmarkRequest.ts` | 28 lines. `BenchmarkRequestSchema` and the scaffold's `BenchmarkResponseSchema` |

## Connected folders

- [`../services/`](../services/FOLDER.md) - `BenchmarkRunner` produces these.
- [`src/components/dashboard/`](../../../../components/dashboard/FOLDER.md) -
  `api.ts` imports these types with `import type`, so the dashboard cannot drift
  from the envelope without a compile error.
- [`tests/benchmark/`](../../../../../tests/benchmark/FOLDER.md) -
  `benchmark-measurement.test.ts` is about what `summarise()` **refuses** to
  report.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/benchmark/application/`](../FOLDER.md)
- [`src/shared/`](../../../../shared/FOLDER.md)
- [`src/shared/types/`](../../../../shared/types/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
