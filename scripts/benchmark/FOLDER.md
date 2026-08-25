# `scripts/benchmark/` - evidence producers

**Work package:** benchmark and provider layer.

## What this folder is

Three scripts that produce the contents of `evidence/benchmark/`. Between them
they are the only thing in the repository that generates measured performance
figures.

## What happened here

`run-benchmark.ts` was updated alongside the runner changes - the cold-start
iteration, the residency probe and the new readiness inputs all flow through
it - but its contract did not change: every figure it writes carries the
provenance label the adapter attached, and it deliberately does not touch the
database, so it can be run before Prisma is set up.

## Files

| File | What it is |
|---|---|
| `run-benchmark.ts` | 220 lines. `npm run bench:run -- --provider=ollama --model=... --iterations=5`. The only script that produces measured performance figures. Needs a provider that actually answers - a running Ollama or an API key |
| `capture-failure-evidence.ts` | 578 lines. `npm run bench:evidence:failures`. Drives timeout, fallback and error-classification scenarios through the **real** adapters and the **real** runner and writes `failure-modes.json`. Exists separately from the tests because a green suite proves the behaviour to whoever runs it; an artefact proves it to whoever reads the pull request |
| `capture-clean-start.ts` | 585 lines. `npm run bench:clean-start`. Runs the documented clean-environment sequence and writes down what happened, with real exit codes and real stderr. Does not summarise, does not retry silently, and exits non-zero on a failed step |

## Connected folders

- [`evidence/benchmark/`](../../evidence/benchmark/FOLDER.md) - what these write.
- [`src/modules/benchmark/`](../../src/modules/benchmark/FOLDER.md) - the module
  they drive.
- [`docs/benchmark/`](../../docs/benchmark/FOLDER.md) - the research log that
  cites their output.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`scripts/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
