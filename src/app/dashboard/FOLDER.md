# `src/app/dashboard/` - the benchmark dashboard route

**Work package:** product UI and benchmark dashboard.

## What this folder is

The `/dashboard` route: a page, a loading state, an error state, and the
module's stylesheet.

## What happened here

`page.tsx` went from **692 lines to 15**. Everything it used to do now lives in
[`src/components/dashboard/`](../../components/dashboard/FOLDER.md), which is
the difference between behaviour that can be unit tested and behaviour that can
only be tested through a request.

`dashboard.css` grew by 45 lines - the installed-models panel and the
cold-start row in the results needed styling.

The stylesheet is entirely scoped under `.epd`. That scoping is why
`src/app/globals.css` could shrink from 418 lines to 27: the dashboard's design
system stopped leaking into the home page and the vision dashboard.

**Hosted-mode pass.** `dashboard.css` gained the `/setup` page's styles (steps, command block, key rows) and `btn-row-baseline`, a row that aligns buttons with a labelled control's bottom edge.

## Files

| File | What it is |
|---|---|
| `page.tsx` | 16 lines. Metadata and a mount point |
| `dashboard.css` | 614 lines. The module-scoped design system. Light and dark, reduced-motion, focus-visible, and a colour-vision-deficiency validated provider palette in which **colour follows the provider entity, never rank or state** |
| `loading.tsx` | 16 lines. The App Router's route-level loading convention |
| `error.tsx` | 30 lines. The route-level error boundary - which is why the team's three separate loading and error-boundary components were not needed |

## Connected folders

- [`src/components/dashboard/`](../../components/dashboard/FOLDER.md) - where
  the 692 lines went.
- [`docs/dashboard/`](../../../docs/dashboard/FOLDER.md) - the module guide.
- [`src/app/`](../FOLDER.md) - why `globals.css` is 27 lines.

<p align="right"><sub><i>Adham Yakout</i></sub></p>
