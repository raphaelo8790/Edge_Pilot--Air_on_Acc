# `src/app/api/v1/readiness/[id]/` - one readiness score

**Work package:** benchmark and provider layer.

## What this folder is

`GET /api/v1/readiness/[id]` - the readiness score recorded for one benchmark.

## What happened here

Two details in this route are easy to get wrong and are pinned by comments in
the file.

`[id]` is the **benchmark** id, not the readiness-score id. `readiness_scores`
has a unique `benchmark_id`, and the caller holds a benchmark id.

The stored `limitations` array carries the assumption lines the run was scored
under, each prefixed `ASSUMPTION:`. They are split back out here so a client
does not need to know about the prefix - **a score must never be read without
the caveats it was computed under.**

What the score itself means changed underneath this route: `hardwareFit` can now
be `null` where it used to always be `50`, and `privacyScore` is gone from the
average entirely.

## Files

| File | What it is |
|---|---|
| `route.ts` | 74 lines. `GET`, returning the score, its breakdown, and its assumptions separated from its limitations |

## Connected folders

- [`src/modules/benchmark/core/services/`](../../../../../modules/benchmark/core/services/FOLDER.md) -
  `ReadinessCalculator.ts` and `HardwareFitAssessor.ts`.
- [`prisma/migrations/`](../../../../../../prisma/migrations/FOLDER.md) - the
  migration that made `hardware_fit` nullable.
- [`src/components/dashboard/`](../../../../../components/dashboard/FOLDER.md) -
  `RunResults.tsx`, which renders it.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/readiness/`](../FOLDER.md)
- [`src/modules/benchmark/`](../../../../../modules/benchmark/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
