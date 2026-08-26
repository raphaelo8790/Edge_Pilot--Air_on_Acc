# `tests/vision-benchmark/` - the vision module under test

**Work package:** vision benchmark.

## What this folder is

Five suites covering the vision workload from schema to provider.

## What happened here

`vision-execution.test.ts` changed most (86 lines differing), because the
warm-up classification changed the shape of an execution.

That change is a useful record of how a small feature goes wrong. The warm-up
consumed a deterministic test clock, so the timings moved - fixed by calling
`provider.classify()` directly rather than the timed wrapper. It fired on
cloud providers, which meant a billable call and one extra image sent to a
third party - fixed by restricting it to local providers and adding an explicit
`warmUp?: boolean`. And it ate the first of the scripted `outputs.shift()`
responses in two existing tests - those two now opt out, with a comment saying
why, and two new tests cover the warm-up behaviour properly.

`vision-api.test.ts` changed to accept datasets whose label set is not the
built-in seven.

## Files

| File | What it covers |
|---|---|
| `vision-benchmark.test.ts` | 356 lines. The workload end to end: metrics, thresholds, evidence shape |
| `vision-execution.test.ts` | 362 lines. The executor, including warm-up behaviour and its opt-out |
| `vision-providers.test.ts` | The Ollama, Gemini and Groq vision adapters |
| `vision-infrastructure.test.ts` | 204 lines. Image processing, manifest loading, the evidence store |
| `vision-api.test.ts` | 78 lines. The `/api/v1/vision-benchmarks` route |

## Connected folders

- [`src/modules/vision-benchmark/`](../../src/modules/vision-benchmark/FOLDER.md) -
  the module under test.
- [`datasets/vision-benchmark/`](../../datasets/vision-benchmark/FOLDER.md) -
  the fixtures `pretest` regenerates before these run.
- [`src/app/api/v1/vision-benchmarks/`](../../src/app/api/v1/vision-benchmarks/FOLDER.md) -
  the route.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/vision-benchmark/application/`](../../src/modules/vision-benchmark/application/FOLDER.md)
- [`src/modules/vision-benchmark/infrastructure/`](../../src/modules/vision-benchmark/infrastructure/FOLDER.md)
- [`tests/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
