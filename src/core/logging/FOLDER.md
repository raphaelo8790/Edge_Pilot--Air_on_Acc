# `src/core/logging/` - the session activity log

**Work package:** benchmark and provider layer.

## What this folder is

A per-session record of what the application did, exportable as JSON, with no
account and no user identity attached.

## What happened here

New, replacing a generic `logger.ts`. Two rules are built in rather than
configurable, and both are there because the obvious design would have been
wrong.

**Redaction is not optional.** The obvious thing for a benchmark log to record
is the prompt. The prompt is also the confidential thing this product exists to
warn people about - the egress warning tells a user "this text is about to leave
your machine", and a log that then writes the same text into a file they can
email around has defeated the warning it just issued. So prompt **content** is
never recorded by default. Only a length and a short digest, which is enough to
prove two runs used the same prompt without disclosing what it was.

**Logging is opt-in by header.** A request without `x-edgepilot-session` is not
logged anonymously and not logged to a default bucket - it is not logged at all.
That keeps the default behaviour "we kept no record of what you ran", which is
the only default consistent with the rest of the application.

The store is cached on `globalThis` for the same reason the Prisma client is:
Next.js hot-reloads modules in development, and a fresh store per reload would
drop every session log mid-use.

## Files

| File | What it is |
|---|---|
| `SessionLog.ts` | 407 lines. The log, its event and category vocabulary, `redact`, `digestPrompt`, the in-memory store, `buildSharePayload` and `SHARE_CONSENT_STATEMENT` |
| `sessionLogStore.ts` | 56 lines. The process-wide store, the `x-edgepilot-session` header name, and `logForRequest` |

## Connected folders

- [`src/app/api/v1/session-log/`](../../app/api/v1/session-log/FOLDER.md) and
  [`share/`](../../app/api/v1/session-log/share/FOLDER.md) - the endpoints.
- [`src/components/dashboard/`](../../components/dashboard/FOLDER.md) -
  `session.ts` generates the header value; `api.ts` writes the header name out
  as a literal rather than importing it, because importing this module from the
  client would instantiate server state at module scope.
- [`src/modules/benchmark/core/services/`](../../modules/benchmark/core/services/FOLDER.md) -
  `egress-warning.ts`, the warning this log must not undermine.
- [`tests/core/`](../../../tests/core/FOLDER.md) - `session-log.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/core/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
