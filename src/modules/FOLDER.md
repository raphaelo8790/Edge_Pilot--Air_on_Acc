# `src/modules/` - the domain modules

**Work packages:** benchmark, and vision benchmark.

## What this folder is

Two modules, each with the same three layers, each able to change without the
other:

- **`core/`** - domain logic. Pure. Imports nothing from `infrastructure/`.
- **`application/`** - use cases and the typed envelopes they return.
- **`infrastructure/`** - adapters. HTTP clients, Prisma, the filesystem.

## What happened here

`modules/device/` was removed entirely. It held a self-reported hardware profile
that no measurement ever consumed - the user typed how much RAM they had and
nothing checked it. Once hardware fit became a VRAM residency reading from the
runtime, the typed value had no consumer left and could only disagree with
reality.

The benchmark module grew by eight core services and two infrastructure
adapters. Every one of them replaced something that was previously a constant,
an assumption, or nothing at all.

The two modules deliberately **duplicate** a small amount of transport code
rather than sharing it - `http.ts` exists in both, with a comment saying the
copy is intentional, because the two modules must be able to change
independently. A shared helper here would couple the vision workload's release
cycle to the benchmark layer's.

## Subfolders

| Module | What it does |
|---|---|
| [`benchmark/`](benchmark/FOLDER.md) | Text and code generation benchmarks across local and cloud providers |
| [`vision-benchmark/`](vision-benchmark/FOLDER.md) | Image classification benchmarks |

## Connected folders

- [`src/app/api/v1/`](../app/api/v1/FOLDER.md) - the routes that dispatch here.
- [`tests/`](../../tests/FOLDER.md) - mirrors both modules.
- [`docs/internal/`](../../docs/internal/FOLDER.md) - `architecture.md`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`scripts/`](../../scripts/FOLDER.md)
- [`src/`](../FOLDER.md)
- [`src/app/`](../app/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
