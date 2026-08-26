# `src/core/` - cross-cutting concerns

**Work package:** benchmark and provider layer.

## What this folder is

Things used by more than one module and owned by none of them. Exactly one
concern lives here now: the session log.

## What happened here

Two whole subfolders were removed and one file was replaced.

`rate-limit/` and `security/` guarded endpoints that have no authentication and
no public URL. Security machinery that protects nothing is not neutral - it
still has to be read, maintained and reasoned about by everyone who comes
after, and it implies a threat model the application does not actually have.

`logging/logger.ts` was replaced by `logging/SessionLog.ts`, which is the
difference between a logging utility and a logging **policy**: a redaction rule,
an export format, and opt-in behaviour.

## Subfolders

| Subfolder | What it holds |
|---|---|
| [`logging/`](logging/FOLDER.md) | The session activity log and its store |
| [`quota/`](quota/FOLDER.md) | `cloudRunQuota.ts` - a small in-memory, per-session cap on cloud vision runs that spend the SERVER's key; a visitor using their own key is not capped. Best-effort, not a security boundary (per process on a serverless host) |

## Connected folders

- [`src/app/api/v1/session-log/`](../app/api/v1/session-log/FOLDER.md) - the
  endpoints that expose it.
- [`tests/core/`](../../tests/core/FOLDER.md) - the suite.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
