# `src/app/setup/` - the setup route

**Work package:** product UI and benchmark dashboard.

## What this folder is

`/setup`. The two things a visitor does once so the hosted site works with
their own machine and their own accounts: allow this site's origin in their
Ollama, and (optionally) paste their own Gemini and Groq keys.

## What happened here

New, and it exists because of hosting. On a developer's laptop the page and
Ollama share one machine, and Ollama trusts localhost by default. On Vercel
the page is served from another origin, and Ollama - correctly - refuses any
website it was not told to trust. That refusal cannot be undone by the page;
it is a one-time setting on the visitor's side, per operating system. This
route gives it the room it needs: OS tabs, the exact command with the site's
real origin filled in, a copy button, and a "check the connection" probe.

The keys section is the visitor's answer to a shared server key: theirs are
stored in their browser, sent with each of their requests, used for that call,
and never written down on the server.

## Files

| File | What it is |
|---|---|
| `page.tsx` | Metadata, the `epd` header with the full nav row, and the mount point for `SetupGuide` |

## Connected folders

- [`src/components/setup/`](../../components/setup/FOLDER.md) - the work.
- [`src/modules/benchmark/infrastructure/`](../../modules/benchmark/infrastructure/FOLDER.md) -
  `browser-ollama.ts` (the probe) and `visitor-keys.ts` (the server half of
  the keys).

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
