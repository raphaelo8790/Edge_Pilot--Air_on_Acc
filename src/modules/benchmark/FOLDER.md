# `src/modules/benchmark/` - the measurement core

**Work package:** AI / local model & DevOps - the benchmark and provider layer.

## What this folder is

The part of EdgePilot that produces numbers, and the part that decides which
numbers it is allowed to produce.

Three layers, and the direction of dependency is the point: `core/` imports
nothing from `infrastructure/`. The ports are two interface files. The single
place an adapter is constructed is `infrastructure/container.ts`. No API route
in this project builds a provider, reads an environment variable, or touches
Prisma - which is exactly what makes this module testable with a fake `fetch`
and a stepped clock.

## What happened here

This is where most of the fix list landed. In summary:

- `hardwareFit` stopped being the constant `50` and became a VRAM residency
  measurement read from the runtime.
- The first iteration of every run is now a **discarded cold start**. On the
  same 8B model, time-to-first-token was 36,445 ms cold and 369 ms warm.
  Averaging that in describes how recently someone used the model, not the
  model.
- Privacy left the readiness average and became an ordinal class that annotates
  or disqualifies a recommendation.
- Comparison gained a planner (local models must not run concurrently - they
  contend for the same GPU) and a report that refuses to declare a winner when
  the observed ranges overlap.
- Modality and task compatibility became real constraints instead of unread
  columns.
- A pre-flight egress warning answers "is this prompt about to leave the
  machine" **before** the request rather than after it.

## Subfolders

| Layer | What is in it |
|---|---|
| [`core/`](core/FOLDER.md) | Entities, ports, and 13 domain services |
| [`application/`](application/FOLDER.md) | DTOs, the runner, and the two use cases |
| [`infrastructure/`](infrastructure/FOLDER.md) | Provider adapters, Prisma repositories, config, the composition root |

## Connected folders

- [`src/app/api/v1/benchmarks/`](../../app/api/v1/benchmarks/FOLDER.md),
  [`comparisons/`](../../app/api/v1/comparisons/FOLDER.md),
  [`providers/`](../../app/api/v1/providers/FOLDER.md),
  [`local-runtime/`](../../app/api/v1/local-runtime/FOLDER.md),
  `readiness/[id]/` ([FOLDER.md](../../app/api/v1/readiness/%5Bid%5D/FOLDER.md)) - the HTTP surface.
- [`tests/benchmark/`](../../../tests/benchmark/FOLDER.md) - 19 suites.
- [`docs/benchmark/`](../../../docs/benchmark/FOLDER.md) - the branch guide and
  the research log.
- [`scripts/benchmark/`](../../../scripts/benchmark/FOLDER.md) - the evidence
  producers.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`docs/`](../../../docs/FOLDER.md)
- [`evidence/benchmark/`](../../../evidence/benchmark/FOLDER.md)
- [`src/modules/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
