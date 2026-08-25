# `src/modules/benchmark/core/` - the domain

**Work package:** benchmark and provider layer.

## What this folder is

Pure domain logic. Nothing in here imports from `infrastructure/`, nothing here
performs I/O, and nothing here knows what HTTP is. That constraint is what lets
the whole scoring layer be tested without a network, a model, or a database.

## What happened here

Eight new service files, 1,761 lines between them, and every one of them
replaced something that was previously a constant, an assumption, or nothing at
all. The single deletion that matters as much as the additions:
`ReadinessCalculator` lost its privacy term.

## Subfolders

| Subfolder | What is in it |
|---|---|
| [`entities/`](entities/FOLDER.md) | `Benchmark`, `BenchmarkResult`, `ReadinessScore` |
| [`ports/`](ports/FOLDER.md) | The two interfaces the infrastructure layer implements |
| [`services/`](services/FOLDER.md) | 10 files - scoring, classification, comparison, privacy |

## Connected folders

- [`../application/`](../application/FOLDER.md) - what calls these.
- [`../infrastructure/`](../infrastructure/FOLDER.md) - what implements the ports.
- [`tests/benchmark/`](../../../../tests/benchmark/FOLDER.md).

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/benchmark/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
