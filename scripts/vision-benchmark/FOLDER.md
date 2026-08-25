# `scripts/vision-benchmark/` - vision dataset and run tooling

**Work package:** vision benchmark.

## What this folder is

Four scripts: one that builds the dataset, one that checks it, and two that run
a benchmark against it - one controlled, one live.

## What happened here

`run.ts` and `validate-dataset.ts` both changed to support datasets that are not
the built-in seven-class one.

`validate-dataset.ts` grew from 57 to 75 lines, mostly to stop a specific
false failure: `perClass` was pinned to `.length(VISION_LABELS.length)`, so a
dataset with a different number of classes would run to completion and *then*
be rejected by validation. Six fields had to be widened together, TypeScript
interfaces and zod schemas in the same pass - widening one without the other
cost three separate build round-trips.

Two operational traps are worth recording because they cost real time:
`npm run ... -- --flag` does not always forward the flag through to the script,
and `node --import tsx` does not load `.env`, so `OLLAMA_VISION_MODEL` was
invisible and the script silently defaulted to a model that was not installed.
Pass the model explicitly.

## Files

| File | What it is |
|---|---|
| `generate-fixtures.mjs` | 727 lines. `npm run vision:fixtures`. Builds the dataset images deterministically. Called automatically by `prebuild` and `pretest`, so a build or a test run never starts from a missing dataset |
| `validate-dataset.ts` | 76 lines. `npm run vision:validate`. Checks the manifest against the files on disk |
| `run.ts` | 114 lines. `npm run vision:run:ollama` / `vision:run:gemini`. A live run against a real model, writing to `evidence/vision-benchmark/` |
| `generate-controlled-evidence.ts` | 144 lines. `npm run vision:evidence:controlled`. Deterministic runs against scripted providers - proves the pipeline, not the model |

## Connected folders

- [`datasets/vision-benchmark/`](../../datasets/vision-benchmark/FOLDER.md) -
  what these build and validate.
- [`evidence/vision-benchmark/`](../../evidence/vision-benchmark/FOLDER.md) -
  what the two run scripts write.
- [`src/modules/vision-benchmark/`](../../src/modules/vision-benchmark/FOLDER.md) -
  the module they drive.
- [`docs/vision-benchmark/`](../../docs/vision-benchmark/FOLDER.md) -
  `provider-execution.md` documents these commands.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`.github/workflows/`](../../.github/workflows/FOLDER.md)
- [`datasets/`](../../datasets/FOLDER.md)
- [`scripts/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
