# `src/app/history/` - the session history route

**Work package:** shared.

## What this folder is

`/history`. The route, its header, and the shared navigation; the history
itself is a client component because it lives in the visitor's browser.

## What happened here

New. Three kinds of run were being produced and then dropped: the dashboard
held a benchmark in React state until you navigated away, a comparison - the
most expensive thing this application does - survived nowhere at all, and
vision runs were kept but only visible on their own page.

The page is organised **by where data goes, not by what kind of data it is**.
One section never leaves the machine; the other only leaves on an explicit
confirmation. A history page that mixed "saved locally" with "sent to the
maintainers" into one list would make the second easy to do by accident, which
is the exact thing the share flow was built to prevent.

The header lives here rather than in the component because this is a
destination people arrive at from a run and need a way back out of. Without it
the page was a dead end - and auditing that turned up the same problem on the
vision page, which had only a "home" link.

## Files

| File | What it is |
|---|---|
| `page.tsx` | 59 lines. Metadata, the `epd` header with the full nav row, and the mount point |

## Connected folders

- [`src/components/history/`](../../components/history/FOLDER.md) - the work.
- [`src/components/vision/`](../../components/vision/FOLDER.md) -
  `runHistory.ts`, where all three kinds of run are stored.
- [`src/app/api/v1/session-log/`](../api/v1/session-log/FOLDER.md) and
  [`share/`](../api/v1/session-log/share/FOLDER.md) - the export and the
  consent-gated upload.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
