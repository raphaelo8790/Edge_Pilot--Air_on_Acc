# `src/app/` - routes and pages

**Work packages:** product UI (pages) and integration (the API surface), with
individual routes belonging to their modules.

## What this folder is

The Next.js App Router. Every folder here is a URL. Nothing here holds business
logic: a route parses, dispatches and picks a status code, and a page mounts a
component.

## What happened here

The clearest single number in this project is here. `dashboard/page.tsx` went
from **692 lines to 15**. That is not deletion - the behaviour moved into
`src/components/dashboard/`, where it can be tested without a request. A route
file that is 692 lines long is a route file that cannot be unit tested.

`globals.css` went from 418 lines to 27 for the same reason: the dashboard's
styling belongs to the dashboard, scoped under `.epd`, not to every page in
the application.

`auth/` and `api/auth/` were removed - there are no accounts. A new page,
`evidence/`, was added. `vision-benchmark/page.tsx` grew from 73 to 244 lines
to carry the dataset upload.

## Files

| File | What it is |
|---|---|
| `layout.tsx` | 23 lines. The root layout and metadata |
| `page.tsx` | 37 lines. The home page |
| `globals.css` | 28 lines. Genuinely global styling only |

## Subfolders

| Subfolder | Route |
|---|---|
| [`api/`](api/FOLDER.md) | `/api/*` - the whole HTTP API |
| [`dashboard/`](dashboard/FOLDER.md) | `/dashboard` - the benchmark journey |
| [`vision-benchmark/`](vision-benchmark/FOLDER.md) | `/vision-benchmark` |
| [`evidence/`](evidence/FOLDER.md) | `/evidence` - artefacts, rendered |

## Connected folders

- [`src/components/`](../components/FOLDER.md) - what these pages mount.
- [`src/modules/`](../modules/FOLDER.md) - what these routes dispatch to.
- [`public/`](../../public/FOLDER.md) - why a static `index.html` had to be
  removed from there.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
