# `src/modules/benchmark/application/use-cases/` - orchestration

**Work package:** benchmark and provider layer.

## What this folder is

Two use cases: run a benchmark and persist it, and compare several runs without
persisting anything.

## What happened here

`RunComparison.ts` is new. `RunBenchmark.ts` changed by 90 lines, and two of its
decisions are worth reading before anyone changes them - both are written into
the file's own header.

**Where `userId` comes from.** Ownership is derived from the workload the
request names: `workloads.user_id` is required, and the benchmark is about that
workload. This began as an interim rule while there was no session. It survived
now that there *is* one, because it is still the right answer - a benchmark
belongs to whoever owns the thing being benchmarked, and the workload row is
already owned by the session that created it.

**Why `RunComparison` does not persist.** A comparison is an analysis of runs,
not a new kind of record. Making it depend on a workload row would tie a
read-only question to the write path. The individual outcomes come back in full,
so a caller that wants to store them can.

`RunComparison` also honours the plan's execution mode rather than always
reaching for `Promise.all` - which matters, because running two local models
concurrently measures GPU contention rather than the models.

## Files

| File | What it is |
|---|---|
| `RunBenchmark.ts` | 309 lines. Validate the referenced rows, run, persist, return. Includes `statusForFailedRun` and the graceful-degradation path when the database is down mid-run |
| `RunComparison.ts` | 213 lines. Decide comparability, decide execution mode, run, report per-dimension verdicts |

## Connected folders

- [`../services/`](../services/FOLDER.md) - the runner both call.
- [`../../core/services/`](../../core/services/FOLDER.md) - `ComparisonPlanner`
  and `ComparisonReport`.
- [`../../infrastructure/repositories/`](../../infrastructure/repositories/FOLDER.md) -
  persistence and the context lookup.
- [`src/app/api/v1/benchmarks/`](../../../../app/api/v1/benchmarks/FOLDER.md) and
  [`comparisons/`](../../../../app/api/v1/comparisons/FOLDER.md) - the routes.
- [`tests/benchmark/`](../../../../../tests/benchmark/FOLDER.md) -
  `run-benchmark.test.ts`, `run-comparison.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/benchmark/application/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
