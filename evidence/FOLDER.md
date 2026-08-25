# `evidence/` - generated proof

**Work package:** benchmark and DevOps, with the vision artefacts belonging to
the vision benchmark.

## What this folder is

Artefacts a reviewer can read **without running anything**. That is the whole
design constraint. A passing test proves a behaviour to whoever runs the suite;
a committed artefact proves it to whoever opens the pull request.

Every file here is written by a script, never by hand, and every one of them
leads with two fields: `what_this_proves` and `what_this_does_not_prove`. The
second field is the reason the folder is worth trusting.

## What happened here

`evidence/evaluation/` is new - it holds the ten-case matrix the submission
checklist asks for, which previously existed only as behaviour scattered across
the unit suite.

Two live vision measurements were produced, the first ones the project has ever
had. They exist only because of a one-character fix: the evidence writer
validated filenames as lowercase-only and then built them from an ISO timestamp
containing `T` and `Z`, so the live path had never once succeeded.

The `.gitignore` rule `/evidence/vision-benchmark/live-*.json` was silently
excluding those runs. One is now explicitly un-ignored with the reasoning
written beside the rule.

## Files

Subfolders only.

| Subfolder | What is in it |
|---|---|
| [`benchmark/`](benchmark/FOLDER.md) | Measured provider runs, failure-mode captures, the clean-start log |
| [`evaluation/`](evaluation/FOLDER.md) | The ten-case evaluation matrix |
| [`vision-benchmark/`](vision-benchmark/FOLDER.md) | Controlled and live image-classification runs |

## Connected folders

- [`scripts/`](../scripts/FOLDER.md) - everything here is written by something there.
- [`src/app/evidence/`](../src/app/evidence/FOLDER.md) - the page that renders
  these files in the browser.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
