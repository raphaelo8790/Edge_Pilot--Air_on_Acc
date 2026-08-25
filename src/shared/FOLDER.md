# `src/shared/` - types crossing module boundaries

**Work package:** integration and API surface.

## What this folder is

The scaffold's shared type definitions and zod schemas.

## What happened here

`types/device.ts` was removed with the device module. The rest is largely
unchanged, and its role has narrowed in a way worth understanding: the benchmark
module now defines its own richer measurement envelope in
`application/dtos/BenchmarkMeasurement.ts`, and the dashboard imports **that**
rather than these. These remain the scaffold contract and the shape the original
endpoints were written against.

## Subfolders

| Subfolder | What it holds |
|---|---|
| [`types/`](types/FOLDER.md) | Benchmark, provider and workload types with their zod schemas |

## Connected folders

- [`src/modules/benchmark/application/dtos/`](../modules/benchmark/application/dtos/FOLDER.md) -
  the superset that supersedes these for measurement.
- [`src/app/api/v1/`](../app/api/v1/FOLDER.md) - the routes that validate with them.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
