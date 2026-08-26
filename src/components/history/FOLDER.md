# `src/components/history/` - everything this session produced

**Work package:** shared.

## What this folder is

One client component rendering three run tables and the session-log controls.

## What happened here

New. Three tables, one per kind of run - text and code, comparisons, vision -
each with per-row download, download-all, select-some, and clear. Plus the
activity log: download it, or share it through the existing consent flow.

Two rules it exists to hold:

**The preview is the payload.** The share section renders `would_send`
directly, and the consent statement and disclosure lines come from the server
rather than being retyped here. A preview that described the upload instead of
being it would drift, and a drifted preview is worse than none.

**A dataset you supplied is download-only.** Runs against the built-in dataset
may be shared; runs against your own images may not, because their sample ids
are your filenames, their labels are your folder names, and the outputs are a
model describing your pictures. The table marks every row `built-in` or
`yours` so this is visible before anything is clicked.

The session id is never rendered, the same rule
`components/dashboard/session.ts` states.

**Hosted-mode pass.** The database panel that sat at the bottom of the page was removed with its endpoint - a debugging aid on a user-facing page, and one that told any visitor there was a Postgres to talk to. The vision-runs block was brought in line with the other two (per-row download, download-all, clear; no checkbox selection). The text-and-code table gained a **Measured in** column: `this browser` for an Ollama run the tab made against the visitor's own machine, `server` for a cloud run.

## Files

| File | What it is |
|---|---|
| `SessionHistory.tsx` | Three run tables, each with per-row and bulk download and clear, the log export, and the consent-gated share |

## Connected folders

- [`src/app/history/`](../../app/history/FOLDER.md) - the route and its header.
- [`src/components/vision/`](../vision/FOLDER.md) - `runHistory.ts`, the store
  all three tables read.
- [`src/components/dashboard/`](../dashboard/FOLDER.md) - `api.ts` supplies
  the share preview and upload functions.
- [`src/core/logging/`](../../core/logging/FOLDER.md) - what the activity log is.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/components/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
