# `src/app/api/v1/session-log/` - export or discard the session record

**Work package:** benchmark and provider layer.

## What this folder is

`GET /api/v1/session-log` exports this session's activity as JSON.
`DELETE` discards it. New in this version.

## What happened here

The session is identified by the `x-edgepilot-session` header, which the client
generates. There is no account, no cookie and no server-assigned identity: a
caller that stops sending the header simply has no log.

`GET` returns a **downloadable document** rather than an API envelope, because
the point of it is to be saved and attached to something. The `disclosure`
block travels inside the file, so a copy that changes hands still states what
was and was not recorded - which matters, because prompt content is never in it.

There is **no UI for this endpoint yet**.

## Files

| File | What it is |
|---|---|
| `route.ts` | 85 lines. `GET` export, `DELETE` discard |

## Subfolders

- [`share/`](share/FOLDER.md) - the consent-gated upload.

## Connected folders

- [`src/core/logging/`](../../../../core/logging/FOLDER.md) - `SessionLog.ts`
  and the store.
- [`src/components/dashboard/`](../../../../components/dashboard/FOLDER.md) -
  `session.ts`, which generates the header value.
- [`tests/core/`](../../../../../tests/core/FOLDER.md) - `session-log.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/`](../FOLDER.md)
- [`src/app/history/`](../../../history/FOLDER.md)
- [`src/core/`](../../../../core/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
