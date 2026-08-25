# `src/app/evidence/` - the evidence page

**Work package:** DevOps.

## What this folder is

The `/evidence` route: everything in `evidence/` rendered in the browser, so a
reviewer can read the artefacts without opening a terminal.

## What happened here

New. Two things about it are deliberate.

**It leads with the limits.** Every artefact is introduced by its own
`what_this_proves` and `what_this_does_not_prove` fields before a single number
appears. An evidence page that opened with a score would be a marketing page.

**Its file reads use literal path segments.** The first version built paths with
a dynamic `path.join(process.cwd(), root)` inside a loop, which defeats Next's
file tracing - the tracer cannot see which files are needed, so it conservatively
traced the entire project into the standalone bundle. Rewritten as two explicit
calls with literal segments.

## Files

| File | What it is |
|---|---|
| `page.tsx` | 286 lines. Reads `evidence/benchmark/` and `evidence/evaluation/` at request time and renders each artefact with its claims and its caveats |

## Connected folders

- [`evidence/`](../../../evidence/FOLDER.md) - what this page reads.
- [`evidence/evaluation/`](../../../evidence/evaluation/FOLDER.md) - the
  ten-case matrix it renders.
- [`scripts/`](../../../scripts/FOLDER.md) - what writes the files.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`evidence/benchmark/`](../../../evidence/benchmark/FOLDER.md)
- [`evidence/vision-benchmark/`](../../../evidence/vision-benchmark/FOLDER.md)
- [`src/app/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
