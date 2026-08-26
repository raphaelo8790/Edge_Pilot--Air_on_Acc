# `src/components/` - React components

**Work packages:** product UI dashboard, and vision benchmark.

## What this folder is

Everything the user actually sees, in two groups by feature.

## What happened here

Four files were removed from this level: `ErrorBoundary.tsx`, `Loading.tsx`,
`LoadingStates.tsx` and `providers/`. Three of those were overlapping answers
to the same question, and the App Router already has a convention for it -
`loading.tsx` and `error.tsx` beside the route. What genuinely needed sharing
is 85 lines in `dashboard/StateViews.tsx`.

`vision/` is new, and it holds a component with an unusual constraint: it must
work entirely in the browser, because the images it handles are not allowed to
reach the server.

## Subfolders

| Subfolder | What it holds |
|---|---|
| [`dashboard/`](dashboard/FOLDER.md) | 11 files - the benchmark journey |
| [`vision/`](vision/FOLDER.md) | Both vision run panels, the browser run store, and the threshold note |
| [`compare/`](compare/FOLDER.md) | The comparison application - the UI the comparison engine never had |
| [`history/`](history/FOLDER.md) | Every run this session produced, and what may leave the machine |

## Connected folders

- [`src/app/`](../app/FOLDER.md) - the routes that mount these.
- [`docs/dashboard/`](../../docs/dashboard/FOLDER.md) - the module guide.
- [`tests/dashboard/`](../../tests/dashboard/FOLDER.md) - the helper tests.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
