# `src/components/dashboard/` - the benchmark journey

**Work package:** product UI and benchmark dashboard / integration lead.

## What this folder is

Eleven files implementing the four-step user journey: workload, provider and
model, run, results. This is where the 692 lines that used to be in
`app/dashboard/page.tsx` now live, and the move is what makes them testable.

## What happened here

The largest change in the folder is a **deletion**. `SetupPanel.tsx` went from
322 lines to 201 - 379 lines differing - because the UUID field and everything
around it went away. Users were being asked to paste a workload uuid by hand,
because the endpoint that should have created one did not persist. Once
`POST /api/v1/workloads` wrote real rows, the field, the placeholder-id
detection and the "this was not saved" warning all became dead weight.

The identity that replaced it is `session.ts`, and the important property is
that it is **never rendered**. A user should no more be asked to see their own
row-ownership key than to type their own cookie.

`InstalledModels.tsx` and `VisionHandoff.tsx` are new. The installed-models
panel is always visible and filters by step: on step 1 models that cannot serve
the chosen task are greyed out; from step 2 only models that will work are
offered at all.

The input and output format fields became read-only derived text - an
informant, not a control. They describe what the chosen task sends and returns;
they were never things a user could meaningfully change.

## Files

| File | What it is |
|---|---|
| `DashboardApp.tsx` | 204 lines. The step machine and shared state |
| `SetupPanel.tsx` | 202 lines. Step 1 - the workload. No uuid field any more |
| `ProviderPanel.tsx` | 295 lines. Step 2 - the live catalogue. Unconfigured providers are visible but not selectable |
| `RunPanel.tsx` | 316 lines. Step 3 - prompt, iterations, elapsed feedback. Tells the user their iteration count will be raised by one for the discarded cold start |
| `RunResults.tsx` | 414 lines. Step 4 - per-iteration table with provenance badges, null-honest summary tiles, the fallback chain, readiness and its stored breakdown, evidence, assumptions, limitations, JSON export, and the cold-start row |
| `InstalledModels.tsx` | 245 lines. The always-visible model panel, with `fitFor` deciding what is offered at each step |
| `VisionHandoff.tsx` | 88 lines. The route into the vision dashboard |
| `StateViews.tsx` | 85 lines. `EmptyState`, `ErrorState`, `LoadingState` - what replaced three separate top-level components |
| `api.ts` | 243 lines. The one typed gateway. Every request goes through it, so components render exactly one error shape. Types come from the benchmark module's DTOs via `import type`, erased at build time, so the dashboard cannot drift from the measurement envelope without a compile error |
| `format.ts` | 86 lines. Display helpers whose job is that **no component ever turns a `null` into a `0`** |
| `session.ts` | 92 lines. The browser's own durable id in `localStorage`, sent as `x-edgepilot-session`, never displayed. `localStorage` and not `sessionStorage`, because a workload registered in one tab has to still be yours in the next tab, and tomorrow |

## Connected folders

- [`src/app/dashboard/`](../../app/dashboard/FOLDER.md) - the route and the
  `.epd`-scoped stylesheet.
- [`src/app/api/v1/`](../../app/api/v1/FOLDER.md) - what `api.ts` talks to.
- [`src/lib/`](../../lib/FOLDER.md) - `sessionOwner.ts`, the server half of
  `session.ts`.
- [`src/modules/benchmark/application/dtos/`](../../modules/benchmark/application/dtos/FOLDER.md) -
  the types `api.ts` imports.
- [`tests/dashboard/`](../../../tests/dashboard/FOLDER.md) - `format.test.ts`.
- [`docs/dashboard/`](../../../docs/dashboard/FOLDER.md) - the module guide,
  including the requests this folder made of the other work packages.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/local-runtime/`](../../app/api/v1/local-runtime/FOLDER.md)
- [`src/app/api/v1/providers/`](../../app/api/v1/providers/FOLDER.md)
- `src/app/api/v1/readiness/[id]/` ([FOLDER.md](../../app/api/v1/readiness/%5Bid%5D/FOLDER.md))
- [`src/app/api/v1/session-log/`](../../app/api/v1/session-log/FOLDER.md)
- [`src/app/api/v1/workloads/`](../../app/api/v1/workloads/FOLDER.md)
- [`src/app/vision-benchmark/`](../../app/vision-benchmark/FOLDER.md)
- [`src/components/`](../FOLDER.md)
- [`src/core/logging/`](../../core/logging/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
