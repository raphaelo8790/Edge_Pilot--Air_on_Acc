# `src/shared/types/` - the scaffold contract

**Work package:** integration and API surface.

## What this folder is

Four small files pairing a TypeScript type with the zod schema that validates
it, so validation and typing cannot disagree.

## What happened here

`device.ts` was deleted with the device module, and `index.ts` lost its export
of it - a one-line change that is the visible end of a removal touching the UI,
the API, the module and the database.

`benchmark.ts` changed by three lines. That small number is deliberate: the
benchmark module's own DTO is a **superset** of this shape rather than a
replacement, keeping every field it already had, in the same place, with the
same name, so the dashboard being written against this contract did not have to
be rewritten.

## Files

| File | What it is |
|---|---|
| `benchmark.ts` | 46 lines. `BenchmarkRequest`, `BenchmarkResult`, `ReadinessScore` and their schemas |
| `provider.ts` | 46 lines. `Provider`, `AIProvider`, `AIResponse`, `ProviderBenchmarkResult` |
| `workload.ts` | 17 lines. `Workload`, `CreateWorkloadRequest` and their schemas |
| `index.ts` | 4 lines. Re-exports. Three lines now, where there were four |

## Connected folders

- [`src/modules/benchmark/application/dtos/`](../../modules/benchmark/application/dtos/FOLDER.md) -
  the superset envelope.
- [`src/app/api/v1/workloads/`](../../app/api/v1/workloads/FOLDER.md) - validates
  against `CreateWorkloadSchema`.
- [`src/shared/`](../FOLDER.md) - the parent.

<p align="right"><sub><i>Adham Yakout</i></sub></p>
