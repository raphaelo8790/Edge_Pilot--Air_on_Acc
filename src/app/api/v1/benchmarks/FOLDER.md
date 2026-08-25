# `src/app/api/v1/benchmarks/` - run and record a benchmark

**Work package:** benchmark and provider layer.

## What this folder is

`POST /api/v1/benchmarks` runs a benchmark and records it. `GET` lists recorded
benchmarks for one owner.

## What happened here

The response envelope is unchanged from the scaffold, deliberately - the
dashboard is written against it, and everything new was added *inside* `data`
rather than beside it.

This route is server-side only and must stay that way: it is the only thing in
the request path that can see `GEMINI_API_KEY` and `GROQ_API_KEY`.

The measurement it now returns is a different thing from what it used to
return: a real hardware fit instead of the constant 50, a discarded cold-start
iteration reported separately, and a readiness score with privacy taken out of
the average.

## Files

| File | What it is |
|---|---|
| `route.ts` | 174 lines. `POST` and `GET`, plus `dynamic` and `maxDuration`. `maxDuration` matters - a cold local model can take over half a minute to answer its first request |

## Connected folders

- [`src/modules/benchmark/application/use-cases/`](../../../../modules/benchmark/application/use-cases/FOLDER.md) -
  `RunBenchmark`, what this dispatches to.
- [`src/modules/benchmark/infrastructure/`](../../../../modules/benchmark/infrastructure/FOLDER.md) -
  `container.ts`, where the wired use case comes from.
- [`tests/benchmark/`](../../../../../tests/benchmark/FOLDER.md) -
  `benchmarks-route.test.ts`.
- [`docs/internal/`](../../../../../docs/internal/FOLDER.md) - `benchmark-api.md`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/`](../FOLDER.md)
- [`src/modules/benchmark/`](../../../../modules/benchmark/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
