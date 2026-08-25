# `src/lib/` - process-level singletons

**Work package:** integration and API surface; `sessionOwner.ts` belongs to the
benchmark layer.

## What this folder is

Two files, both answering a question that has exactly one correct answer per
process: which Prisma client, and who owns this row.

## What happened here

`sessionOwner.ts` is new, and it closed a real data leak.

Two routes previously attributed every row they created to a single hardcoded
user, `local-sandbox@edgepilot.invalid`, with a comment saying session handling
did not exist yet. On one laptop that is harmless. The moment the application is
hosted it is a leak: `GET` would hand every visitor every other visitor's
workloads, because they would all be the same user.

The replacement **fails closed**. A request with no session id gets a 400. It
does not fall back to a shared user - that fallback is exactly the leak, and it
fails silently, because the caller gets a 200 and someone else's data.

## Files

| File | What it is |
|---|---|
| `prisma.ts` | 33 lines. The single `PrismaClient` for the process, cached on `globalThis`. Without the cache, a new client per hot reload exhausts the database connection limit within a few edits |
| `sessionOwner.ts` | 76 lines. `sessionIdOf(request)`, `resolveOwnerId(sessionId)` which upserts a `User`, and `missingSession()` which returns the 400 |

## Connected folders

- [`src/components/dashboard/`](../components/dashboard/FOLDER.md) -
  `session.ts`, the browser half that generates the id.
- [`src/app/api/v1/workloads/`](../app/api/v1/workloads/FOLDER.md) - the route
  that used to attribute everything to one user.
- [`prisma/`](../../prisma/FOLDER.md) - the `users.session_id` column and the
  migration that added it.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`docs/benchmark/`](../../docs/benchmark/FOLDER.md)
- [`src/`](../FOLDER.md)
- [`src/app/api/v1/`](../app/api/v1/FOLDER.md)
- [`src/modules/benchmark/infrastructure/repositories/`](../modules/benchmark/infrastructure/repositories/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
