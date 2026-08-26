# `src/app/compare/` - the comparison route

**Work package:** product UI and benchmark dashboard.

## What this folder is

`/compare`. A 14-line route file that mounts `CompareApp`.

## What happened here

New, and it closed a gap that had been in the known-gaps list as *"works,
nothing calls it"*: `/api/v1/comparisons` had a complete backend, a planner
that decides whether entrants may be compared at all, and a report that
refuses to name a winner inside the noise - and no user interface whatsoever.

The route is thin on purpose. All 899 lines of behaviour live in
[`src/components/compare/`](../../components/compare/FOLDER.md), where they
can be tested without a request.

## Files

| File | What it is |
|---|---|
| `page.tsx` | 14 lines. Metadata and a mount point |

## Connected folders

- [`src/components/compare/`](../../components/compare/FOLDER.md) - the application.
- [`src/app/api/v1/comparisons/`](../api/v1/comparisons/FOLDER.md) - the endpoint it drives.
- [`src/modules/benchmark/core/services/`](../../modules/benchmark/core/services/FOLDER.md) -
  `ComparisonPlanner` and `ComparisonReport`, which decide what may be claimed.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
