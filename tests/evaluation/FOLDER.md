# `tests/evaluation/` - the matrix artefact under test

**Work package:** benchmark and provider layer.

## What this folder is

One suite, pinning the shape of `evidence/evaluation/ten-case-matrix.json`.

## What happened here

New. The matrix is now rendered as a page, which means its shape is a contract
rather than a private detail - and the failure it guards against is a quiet
one: a category the page cannot render would otherwise **vanish from the list
silently**, leaving a matrix that looks complete while showing nine cases.

That is the same class of defect as reporting `0` for "not measured": not a
crash, just a result that is wrong in a way nobody notices.

## Files

| File | What it covers |
|---|---|
| `ten-case-matrix.test.ts` | 134 lines. Case count, the six categories, and that every category the artefact declares can actually be rendered |

## Connected folders

- [`evidence/evaluation/`](../../evidence/evaluation/FOLDER.md) - the artefact.
- [`scripts/evaluation/`](../../scripts/evaluation/FOLDER.md) - what writes it.
- [`src/app/evaluation/`](../../src/app/evaluation/FOLDER.md) - the page that
  renders it.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`tests/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
