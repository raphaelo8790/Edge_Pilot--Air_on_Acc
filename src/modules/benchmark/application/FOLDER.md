# `src/modules/benchmark/application/` - use cases and envelopes

**Work package:** benchmark and provider layer.

## What this folder is

The layer between HTTP and the domain. It orchestrates: validate, measure,
persist, return.

## What happened here

The runner grew by 269 differing lines, carrying the cold-start iteration and
the residency probe. The use case shrank slightly while gaining an ownership
rule that had been implicit.

The design decision that survived every change: **persistence is layered on top
of measurement, not inside it.** `BenchmarkRunner` knows nothing about the
database, so when Postgres is unreachable mid-run the measurement is still
returned to the caller with `persisted: false`, rather than being thrown away.
A benchmark that ran is evidence whether or not it was saved.

## Subfolders

| Subfolder | What is in it |
|---|---|
| [`dtos/`](dtos/FOLDER.md) | The typed measurement envelope and the request schema |
| [`services/`](services/FOLDER.md) | `BenchmarkRunner` |
| [`use-cases/`](use-cases/FOLDER.md) | `RunBenchmark`, `RunComparison` |

## Connected folders

- [`../core/`](../core/FOLDER.md) - the domain services it calls.
- [`../infrastructure/`](../infrastructure/FOLDER.md) - the adapters it is handed.
- [`tests/benchmark/`](../../../../tests/benchmark/FOLDER.md).

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/benchmark/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
