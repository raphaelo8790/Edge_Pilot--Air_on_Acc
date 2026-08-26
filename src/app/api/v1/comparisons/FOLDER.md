# `src/app/api/v1/comparisons/` - compare two or more models

**Work package:** benchmark and provider layer.

## What this folder is

`POST /api/v1/comparisons`. New in this version.

## What happened here

The response is deliberately three separate things rather than one verdict:

- **`plan`** - what was decided *before* anything ran: whether the entrants are
  comparable at all, whether they had to run one after another, and why. A
  reader who disagrees with the conclusion can check the method first.
- **`outcomes`** - each run in full and unchanged, so nothing is available only
  in summarised form.
- **`report`** - per-dimension winners, each marked established or not.

Nothing is written to the database. A comparison analyses runs; it is not a new
kind of record, and making it depend on a workload row would tie a read-only
question to the write path.

There is **no UI for this endpoint yet**. It works and is tested; nothing in the
dashboard calls it.

**Hosted-mode pass.** Each entrant may carry a `recorded` measurement from the visitor's browser (Ollama only; length must be `iterations + 1`, enforced in `superRefine`). Families and parameter size for a local entrant now arrive from the browser's own catalogue too, since the server's `localModelCatalogue()` sees nothing when hosted. `parseParameterSize` moved to `application/dtos/LocalRuntime.ts` so both sides use one parser. The visitor's own cloud keys apply per request.

## Files

| File | What it is |
|---|---|
| `route.ts` | 290 lines. `POST`, returning plan, outcomes and report |

## Connected folders

- [`src/modules/benchmark/application/use-cases/`](../../../../modules/benchmark/application/use-cases/FOLDER.md) -
  `RunComparison`.
- [`src/modules/benchmark/core/services/`](../../../../modules/benchmark/core/services/FOLDER.md) -
  `ComparisonPlanner` and `ComparisonReport`, the two files that make the
  verdict defensible.
- [`tests/benchmark/`](../../../../../tests/benchmark/FOLDER.md) -
  `comparison.test.ts`, `run-comparison.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/`](../FOLDER.md)
- [`src/app/compare/`](../../../compare/FOLDER.md)
- [`src/components/compare/`](../../../../components/compare/FOLDER.md)
- [`src/modules/benchmark/`](../../../../modules/benchmark/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
