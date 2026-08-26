# `tests/core/` - cross-cutting concerns under test

**Work package:** benchmark and provider layer.

## What this folder is

One suite, covering the session log.

## What happened here

New, alongside `src/core/logging/`. The tests exist mainly to pin the redaction
rule, which is the part of the session log that would be easiest to relax by
accident: prompt **content** is never recorded by default, only a length and a
digest. A log that wrote out the same prompt the egress warning had just
flagged would have defeated its own warning.

They also pin the opt-in behaviour: a request without a session header is not
logged anonymously and not logged to a default bucket - it is not logged at
all.

## Files

| File | What it covers |
|---|---|
| `prisma-session-log-store.test.ts` | The database-backed log store against a fake client: every event persisted, an export from another process reads them all, discard deletes one session only, a failing database never throws |
| `cloud-run-quota.test.ts` | The per-visitor cap on cloud vision runs made with the server's key: the allowance, the hour window, and session separation |
| `session-log.test.ts` | 224 lines. Redaction, prompt digests, the share payload and its consent statement, and the in-memory store's bounds |

## Connected folders

- [`src/core/logging/`](../../src/core/logging/FOLDER.md) - the code under test.
- [`src/app/api/v1/session-log/`](../../src/app/api/v1/session-log/FOLDER.md) -
  the endpoints that expose it.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/core/`](../../src/core/FOLDER.md)
- [`src/core/quota/`](../../src/core/quota/FOLDER.md)
- [`tests/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
