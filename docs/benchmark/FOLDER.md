# `docs/benchmark/` - benchmark and provider layer documentation

**Work package:** AI / local model & DevOps - the benchmark and provider layer.

## What this folder is

The branch guide for the measurement core: what is in it, what was decided,
what evidence backs each decision, and what it deliberately does not do.

## What happened here

These two documents are the reason the fix list in `00-PROJECT-RECORD.md` could
be written with reasoning rather than guesswork - the research log records why
each decision was taken **and what evidence supports it**, including the
decisions to *not* measure certain things.

The guide includes a section written for the integration work package, and a
statement that there is no authenticated session and ownership is derived from
`workloads.user_id`. That statement is now historically accurate rather than
currently accurate: a session id exists (see
[`src/lib/`](../../src/lib/FOLDER.md)), though the ownership rule it describes
survived on its own merits - a benchmark belongs to whoever owns the workload
being benchmarked.

## Files

| File | What it is |
|---|---|
| `README.md` | 325 lines. Branch guide: scope, the file-by-file map of the module, the decisions, the evidence, the known gaps, and the integration notes |
| `research-log.md` | 374 lines. Per-decision reasoning with official sources - the streaming contracts for Ollama, Groq and Gemini, why nanoseconds and seconds are converted where they are, and what is deliberately not measured |

## Connected folders

- [`src/modules/benchmark/`](../../src/modules/benchmark/FOLDER.md) - the module
  documented here.
- [`docs/internal/`](../internal/FOLDER.md) - `benchmark-api.md` is the wire
  contract these documents refer to.
- [`docs/local-model-setup.md`](../FOLDER.md) - the setup guide, same work
  package.
- [`evidence/benchmark/`](../../evidence/benchmark/FOLDER.md) - the artefacts
  the research log cites.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`scripts/benchmark/`](../../scripts/benchmark/FOLDER.md)
- [`src/modules/benchmark/infrastructure/providers/`](../../src/modules/benchmark/infrastructure/providers/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
