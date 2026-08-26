# `src/components/setup/` - the setup guide

**Work package:** product UI and benchmark dashboard.

## What this folder is

One client component, `SetupGuide`, mounted by `/setup`.

## What happened here

Two sections. **Ollama:** the operating system is guessed from the user agent
so the right tab opens, the site's real origin is read from
`window.location` and written into the command, and a button probes the
visitor's Ollama from the tab and reports "connected, N models" or the remedy.
A passed check is remembered in that browser, so a returning visitor is told
there is nothing to redo. On a page served from localhost the section says so
and skips the steps.

**Keys:** two password fields with show/hide, Save, and Save & test - the
test lists the vendor's models with that key, so a wrong key is caught before
a run spends it. Values go to localStorage through `apiKeys.ts`; nothing that
renders is ever given the key itself.

The command shown uses the site's own origin, not `*`. Allowing every
website would hand the visitor's GPU to any page they open; the note beneath
says how to widen it if they want to.

## Files

| File | What it is |
|---|---|
| `SetupGuide.tsx` | The page body: OS tabs and per-OS commands, the connection check, and the two key fields |

## Connected folders

- [`src/app/setup/`](../../app/setup/FOLDER.md) - the route.
- [`src/components/dashboard/`](../dashboard/FOLDER.md) - `apiKeys.ts` and
  `api.ts`, where the keys are stored and attached.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/components/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
