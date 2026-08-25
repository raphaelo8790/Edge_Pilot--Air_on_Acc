# `.github/` - repository automation

**Work package:** integration and API surface, with each check defined by the
work package whose script it runs.

## What this folder is

GitHub's own configuration directory. It holds one thing: the CI workflow.

## What happened here

Unchanged from the team's version. It is listed and documented because the
checks it runs are the ones section 5.4 of `00-PROJECT-RECORD.md` argues are
load-bearing - in particular `npm run build`, which type-checks the whole
project where Jest type-checks only what it imports.

## Files

Subfolder only. See [`workflows/`](workflows/FOLDER.md).

## Connected folders

- [`workflows/`](workflows/FOLDER.md) - the CI definition.
- [`/`](../FOLDER.md) - the `package.json` whose scripts CI runs.

<p align="right"><sub><i>Adham Yakout</i></sub></p>
