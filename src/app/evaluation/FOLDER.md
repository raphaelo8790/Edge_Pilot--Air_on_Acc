# `src/app/evaluation/` - the ten-case matrix, rendered

**Work package:** product UI and benchmark dashboard.

## What this folder is

`/evaluation`. Renders `evidence/evaluation/ten-case-matrix.json` as a page:
all ten cases, the request that produced each one, and the behaviour observed.

## What happened here

New. The matrix existed as an artefact a reviewer had to open a JSON file to
read; this makes it readable in a browser without losing the detail that makes
it evidence.

The three prompt-injection cases are shown in full rather than summarised as a
count. That is the point of them: the defence is exact matching against a
closed label set with anything else recorded as `invalid_output`, and a reader
can only judge whether that is sufficient by seeing what was actually sent.

`categories.ts` exists so a category the page cannot render fails loudly
instead of vanishing from the list - a silently dropped case would make the
matrix look complete when it was not.

## Files

| File | What it is |
|---|---|
| `page.tsx` | 237 lines. The ten cases with their requests and observed behaviour |
| `categories.ts` | 42 lines. The six category labels and their descriptions |

## Connected folders

- [`evidence/evaluation/`](../../../evidence/evaluation/FOLDER.md) - the artefact rendered.
- [`scripts/evaluation/`](../../../scripts/evaluation/FOLDER.md) - what writes it.
- [`tests/evaluation/`](../../../tests/evaluation/FOLDER.md) - the suite that
  pins the artefact's shape.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
