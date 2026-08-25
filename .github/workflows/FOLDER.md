# `.github/workflows/` - continuous integration

**Work package:** integration and API surface.

## What this folder is

The GitHub Actions definition that runs on every push and pull request against
`main` and `dev`.

## What happened here

Not modified. Worth knowing what it does and does not cover: it runs lint,
tests and a build on a clean Ubuntu runner with Node 24, so it catches the
class of defect that a local machine with a warm `.next` cache will not. It
does **not** run the evidence scripts (`bench:run`, `vision:run:ollama`,
`eval:matrix`) - those need a real provider or a real model, which a CI runner
does not have.

Note that `pretest` regenerates the vision fixtures, so the CI test step
implicitly proves the fixture generator works on a machine that has never seen
the dataset.

## Files

| File | What it is |
|---|---|
| `ci.yml` | 34 lines. Checkout, Node 24 with npm cache, `npm ci`, `npm run lint`, `npm test`, `npm run build` |

## Connected folders

- [`/`](../../FOLDER.md) - the scripts CI invokes live in `package.json`.
- [`tests/`](../../tests/FOLDER.md) - what `npm test` runs.
- [`scripts/vision-benchmark/`](../../scripts/vision-benchmark/FOLDER.md) - the
  `pretest` fixture generator CI exercises on every run.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`.github/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
