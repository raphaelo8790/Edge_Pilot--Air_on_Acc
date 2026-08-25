# `scripts/evaluation/` - the ten-case matrix

**Work package:** benchmark and provider layer.

## What this folder is

One script producing one artefact: the reproducible ten-case evaluation the
submission checklist asks for.

## What happened here

New. The behaviours were already covered by unit tests, but scattered - a
reviewer had to go and find them. This runs them in one place, writes a single
readable artefact, and exits non-zero if any case misbehaves, so it can sit in a
pipeline.

What it proves is bounded and stated in the artefact itself: every case drives
**real module code** - the same zod schemas, the same normaliser, the same
readiness calculator the application uses - so the cases cannot pass against a
mock that has drifted. No network call is made and no result is transcribed by
hand.

## Files

| File | What it is |
|---|---|
| `ten-case-matrix.ts` | 340 lines. `npm run eval:matrix`. Ten cases across six categories: 1 normal, 3 malformed, 1 ambiguous, 3 injection, 1 missing-evidence, 1 provider-failure. Case 9 asserts that a missing hardware fit stays `null` and never becomes `0` |

## On the injection cases

EdgePilot never *acts* on model output - it does not execute it, follow it, or
pass it to another system. The risk is narrower and easier to miss: output being
read as a **verdict**. So the defence is exact matching against a closed label
set, with anything that does not match recorded as `invalid_output` rather than
guessed at. The threat model is written into the artefact so it can be argued
with.

## Connected folders

- [`evidence/evaluation/`](../../evidence/evaluation/FOLDER.md) - the artefact.
- [`src/modules/benchmark/core/services/`](../../src/modules/benchmark/core/services/FOLDER.md) -
  the readiness calculator and assessors under test.
- [`src/modules/vision-benchmark/core/`](../../src/modules/vision-benchmark/core/FOLDER.md) -
  the normaliser the injection cases drive.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`scripts/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
