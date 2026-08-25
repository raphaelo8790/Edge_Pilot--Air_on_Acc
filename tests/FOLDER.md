# `tests/` - the Jest suite

**Work package:** shared, by subfolder, matching the module each suite covers.

## What this folder is

279 tests across 25 suites, mirroring `src/` one level down. Nothing here
touches a network, a real timer, a real model or a real database - every
adapter takes its `fetch` and its clock by injection, which is what makes the
suite deterministic. A benchmark test that depended on real latency would be a
flaky test that also proved nothing.

## What happened here

Eight files were added and six changed, taking the suite from 259 tests to 279.
`tests/core/` is new; so are the suites for hardware fit, task compatibility,
privacy assessment, comparison, comparison runs, the Ollama catalogue and the
egress warning.

The framing is worth stating because it explains why the tests look the way
they do. For a measurement tool the interesting question is not "does it work"
but **"what does it refuse to say"**. So most of these assert refusals: refuse
to call a provider for a workload that does not exist, refuse to attribute a
run to the wrong user, refuse to throw away a measurement because the database
went down mid-run, refuse to declare a comparison winner inside the noise,
refuse to turn a `null` into a `0`.

**What this suite cannot see.** Jest type-checks only what it imports. Two dev
scripts and six schema-versus-interface mismatches were invisible to a green
run and were caught by `next build`, which type-checks the whole project. That
is why both are required checks.

One duplication is known and deliberate: `describeEgressWarning` is covered in
both `egress-warning.test.ts` and `privacy-assessor.test.ts`. It is flagged
rather than consolidated.

## Subfolders

| Subfolder | Covers |
|---|---|
| [`benchmark/`](benchmark/FOLDER.md) | 19 files - the measurement core, the adapters, the routes |
| [`core/`](core/FOLDER.md) | The session log |
| [`dashboard/`](dashboard/FOLDER.md) | The display helpers that enforce null-honesty |
| [`vision-benchmark/`](vision-benchmark/FOLDER.md) | 5 files - the vision module end to end |

## Connected folders

- [`src/`](../src/FOLDER.md) - the tree this mirrors.
- [`.github/workflows/`](../.github/workflows/FOLDER.md) - runs `npm test` on
  every push.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/`](../src/modules/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
