# `scripts/dev/` - local development helpers

**Work package:** benchmark and DevOps.

## What this folder is

Two throwaway-grade helpers for working against a local database. Neither is
imported by the application and neither runs in CI.

## What happened here

Both files broke `next build` during the device removal, and that is the most
useful thing about them. `show-last-run.ts` read `run.deviceId` and
`seed-demo-rows.ts` called `prisma.device.create`. Jest never imports either
file, so the test suite stayed green while the project would not compile. This
is the concrete reason `npm run build` is a required check and not an optional
one.

`seed-demo-rows.ts` is now mostly obsolete by design. It existed because the
workload and device endpoints were scaffold stubs that echoed `temp-*-id` and
never wrote anything, so an end-to-end run had to have its rows seeded from
outside and their uuids pasted into the dashboard by hand. Both of those
problems are gone. It survives for driving a run from curl, where there is no
browser to generate a session id.

## Files

| File | What it is |
|---|---|
| `seed-demo-rows.ts` | 75 lines. Creates the rows a benchmark run needs, for use outside the browser |
| `show-last-run.ts` | 104 lines. Prints what the last benchmark run actually persisted, read straight from the database. The dashboard reporting `persisted: true` is the API telling you what it believes; this is independent evidence the rows are really there |

## Connected folders

- [`prisma/`](../../prisma/FOLDER.md) - the schema both read.
- [`src/app/api/v1/workloads/`](../../src/app/api/v1/workloads/FOLDER.md) - the
  endpoint that made the seeding helper necessary, and then unnecessary.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`scripts/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
