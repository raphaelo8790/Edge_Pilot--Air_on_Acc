# `src/components/compare/` - the comparison application

**Work package:** product UI and benchmark dashboard.

## What this folder is

One 899-line client component driving `/api/v1/comparisons`: pick two to four
entrants, send one prompt, read a per-dimension verdict.

## What happened here

New, and it is the surface that made the comparison engine usable. Three
things in it are worth knowing because they show it was written against this
codebase rather than in spite of it.

**It mirrors the server's validation exactly** - 4,000-character prompt cap,
1 to 20 iterations, at most four entrants - which is the convention the
dashboard docs state: client validation mirrors, never replaces.

**It understands the measurement design.** It tells the user
"{iterations} measured + 1 discarded cold start" and "two local entrants run
one after the other", rather than just calling the endpoint. Those are the
N+1 warm-up and `ComparisonPlanner`'s sequential rule, surfaced rather than
hidden.

**It renders "no winner" as a result.** Every dimension carries an honesty
code, and a row where the observed ranges overlap says so instead of showing
a blank. That is the whole argument of `ComparisonReport`; a UI that rendered
it as an empty cell would have quietly undone it.

It also refuses the same model twice, mirroring the planner's refusal - the
labels are `provider + model` and the report's tally is keyed by them, so a
duplicate collides onto one key and merges two entrants into one verdict.

## Files

| File | What it is |
|---|---|
| `CompareApp.tsx` | 899 lines. Entrant form, egress preview, plan, per-dimension verdicts, and the session-log controls |

## Connected folders

- [`src/app/compare/`](../../app/compare/FOLDER.md) - the route.
- [`src/app/api/v1/comparisons/`](../../app/api/v1/comparisons/FOLDER.md) - the endpoint.
- [`src/modules/benchmark/core/services/`](../../modules/benchmark/core/services/FOLDER.md) -
  `ComparisonPlanner`, `ComparisonReport`.
- [`src/components/vision/`](../vision/FOLDER.md) - `runHistory.ts`, where a
  completed comparison is stored.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/components/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
