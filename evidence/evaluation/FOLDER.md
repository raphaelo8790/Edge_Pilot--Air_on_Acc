# `evidence/evaluation/` - the ten-case matrix

**Work package:** benchmark and provider layer.

## What this folder is

One artefact: the reproducible ten-case evaluation the submission checklist
asks for, covering normal, malformed, ambiguous, injection, missing-evidence
and provider-failure behaviour.

## What happened here

The folder is new. The behaviours it covers already existed in the unit suite,
but a reviewer had to go and find them across several files. `npm run
eval:matrix` now runs them in one place and writes a single readable artefact,
and exits non-zero if any case misbehaves.

Every case drives **real module code** - the same zod schemas, the same
normaliser, the same readiness calculator the application uses. No network call
is made and no result is transcribed by hand.

The injection cases are worth understanding. EdgePilot never *acts* on model
output, so the threat is not command execution; it is model output being
**interpreted as a verdict**. The defence is exact matching against a closed
label set, with anything else recorded as `invalid_output` rather than guessed
at. Case 9 exists to assert a different rule: a missing hardware fit stays
`null` and is never rendered as `0`.

## Files

| File | What it is |
|---|---|
| `ten-case-matrix.json` | 10 cases in 6 categories - 1 normal, 3 malformed, 1 ambiguous, 3 injection, 1 missing-evidence, 1 provider-failure. Current state: all 10 behaved as documented, no failed case ids. Includes the injection threat model in the artefact itself |

## Connected folders

- [`scripts/evaluation/`](../../scripts/evaluation/FOLDER.md) - the script that
  writes this file.
- [`src/modules/benchmark/core/services/`](../../src/modules/benchmark/core/services/FOLDER.md) -
  the readiness calculator and assessors the cases drive.
- [`src/modules/vision-benchmark/core/`](../../src/modules/vision-benchmark/core/FOLDER.md) -
  the normaliser the injection cases exercise.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`evidence/`](../FOLDER.md)
- [`src/app/evaluation/`](../../src/app/evaluation/FOLDER.md)
- [`src/app/evidence/`](../../src/app/evidence/FOLDER.md)
- [`tests/dashboard/`](../../tests/dashboard/FOLDER.md)
- [`tests/evaluation/`](../../tests/evaluation/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
