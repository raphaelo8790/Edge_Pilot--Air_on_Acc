# `src/app/api/v1/workloads/` - workload rows

**Work package:** integration and API surface.

## What this folder is

`POST /api/v1/workloads` creates a workload row and returns its real uuid.
`GET` lists the workloads belonging to the caller.

## What happened here

**This is the single most consequential fix in the project.** The committed
version was a scaffold: it returned the literal string `temp-workload-id` and
never called Prisma. So nothing the dashboard saved ever reached the database,
and every benchmark run afterwards failed with `404 Workload not found`. The
dashboard had grown a workaround for it - detect the placeholder id, warn the
user the row was not saved, and offer a field to paste a real database uuid
into by hand.

The route went from 53 lines to 126 and now writes real rows. Ownership comes
from the caller's session id, so a row belongs to whoever created it without
anyone signing up - and without a uuid ever being shown to, or typed by, a
user. The dashboard's paste-a-uuid fallback and the field that went with it are
gone.

The original scaffold is kept beside the route as `route.ts.scaffold.bak` and
is referenced **by name** in the new file's header, which is why it is
explicitly un-ignored in `.gitignore` while every other `.bak` is ignored.

## Files

| File | What it is |
|---|---|
| `route.ts` | 126 lines. `POST` and `GET`, both scoped to the caller's session |
| `route.ts.scaffold.bak` | The original 53-line stub, kept as the reference the docblock points at |

## Connected folders

- [`src/lib/`](../../../../lib/FOLDER.md) - `sessionOwner.ts`, where the owner
  comes from.
- [`src/components/dashboard/`](../../../../components/dashboard/FOLDER.md) -
  `SetupPanel.tsx`, which lost 379 lines' worth of workaround because of this.
- [`scripts/dev/`](../../../../../scripts/dev/FOLDER.md) - `seed-demo-rows.ts`,
  which existed because this endpoint did not persist.
- [`prisma/`](../../../../../prisma/FOLDER.md) - the `workloads` table.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/`](../FOLDER.md)
- [`src/shared/types/`](../../../../shared/types/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
