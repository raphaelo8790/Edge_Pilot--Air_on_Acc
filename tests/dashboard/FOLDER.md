# `tests/dashboard/` - display helpers under test

**Work package:** product UI.

## What this folder is

One suite, and it defends one rule.

## What happened here

The wire contract makes every aggregate nullable on purpose, because reporting
`0 ms` for "we never got an answer" is the single most misleading number this
system could produce. These tests pin the helpers that stop a `null` becoming a
`0` on screen - which is the last place the rule could be broken, after the
data layer has got it right.

## Files

| File | What it covers |
|---|---|
| `format.test.ts` | 77 lines. `fmtMs`, `fmtNum`, `fmtPct`, `fmtElapsed`, `describeErrorCode`, `isUuid`, `isPlaceholderId` - each asserted to render "not measured" rather than a zero |

## Connected folders

- [`src/components/dashboard/`](../../src/components/dashboard/FOLDER.md) -
  `format.ts`, the file under test.
- [`evidence/evaluation/`](../../evidence/evaluation/FOLDER.md) - case 9 of the
  ten-case matrix asserts the same rule one layer down, in the data.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/components/`](../../src/components/FOLDER.md)
- [`tests/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
