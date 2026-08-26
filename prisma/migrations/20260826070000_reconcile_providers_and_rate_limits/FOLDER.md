# `prisma/migrations/20260826070000_reconcile_providers_and_rate_limits/`

**Work package:** shared.

## What this folder is

The sixth migration. It brings a database created from the team's original
init up to this repository's schema, and does nothing on one that is already
there.

## What happened here

The shared Neon database was found, at deployment time, to carry the team's
original `providers` table (`label`, `enabled`, `config`, no `is_active`)
and no `rate_limits` table, while `_prisma_migrations` recorded this
repository's init as applied - it had failed once, been rolled back, and then
been marked applied without its SQL running. `migrate deploy` therefore said
"nothing pending" and the seed failed on a column that did not exist.

Every statement is conditional (`IF NOT EXISTS`, `DROP COLUMN IF EXISTS`, a
`DO` block), so the same migration is safe on a developer's local database,
which is already correct. `enabled` is copied into `is_active` before it is
dropped, so no provider silently changes state.

## Files

| File | What it is |
|---|---|
| `migration.sql` | Add `is_active` (carrying `enabled` across), drop the three old columns, ensure the unique index on `name`, create `rate_limits` |

## Connected folders

- [`prisma/migrations/`](../FOLDER.md) - the ordered set.
- [`scripts/db/`](../../../scripts/db/FOLDER.md) - `neon.mjs` and
  `inspect-neon.mjs`, which is how the mismatch was found.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`prisma/migrations/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
