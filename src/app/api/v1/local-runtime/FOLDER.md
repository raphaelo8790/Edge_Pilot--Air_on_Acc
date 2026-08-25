# `src/app/api/v1/local-runtime/` - is Ollama running

**Work package:** benchmark and provider layer.

## What this folder is

`GET /api/v1/local-runtime`. New in this version.

## What happened here

It answers a question the application previously answered too late.
`OllamaProvider.isConfigured()` reports only whether a host string is set - by
design, because whether anything is *listening* is a runtime question. The
consequence was that a user with Ollama stopped, or on the wrong port, found out
from a failed benchmark rather than from the screen where they picked the
provider.

Two fields carry the design. `ok` is the single value a caller needs to decide
whether to enable a Run button. `remedy` is what to show when `ok` is false -
never a bare failure, always the command that fixes it.

No credential is involved and no prompt is sent: this reads a version string and
a model list.

## Files

| File | What it is |
|---|---|
| `route.ts` | 73 lines. `GET`, returning runtime state, installed models, and a remedy when something is wrong |

## Connected folders

- [`src/modules/benchmark/infrastructure/`](../../../../modules/benchmark/infrastructure/FOLDER.md) -
  `OllamaCatalog.ts`, which does the work.
- [`src/components/dashboard/`](../../../../components/dashboard/FOLDER.md) -
  `InstalledModels.tsx`, which renders it.
- [`tests/benchmark/`](../../../../../tests/benchmark/FOLDER.md) -
  `ollama-catalog.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/`](../FOLDER.md)
- [`src/modules/benchmark/`](../../../../modules/benchmark/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
