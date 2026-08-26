# `prisma/migrations/` - the ordered schema history

**Work packages:** integration and API surface (the initial migration);
benchmark and DevOps (the four newest).

## What this folder is

Five timestamped folders, each holding one `migration.sql`, applied in name
order. Prisma records which have run; `migration_lock.toml` pins the provider.

## What happened here

Four of the first five are new; the sixth is a reconciliation written at deployment. Taken together they are the database half of every
change described in `00-PROJECT-RECORD.md`, and they were all tested against a
local sandbox database first and only then applied to the shared Neon instance
with `migrate deploy`.

One is a **relaxing** change and one is a **destructive** change, and the
difference is worth knowing before you read them. `DROP NOT NULL` on
`hardware_fit` is relaxing - it widens what the column accepts, so it cannot
break a running application. `DROP TABLE "devices"` is destructive and
irreversible, which is why it was rehearsed locally first.

## Files

| Migration | What it does |
|---|---|
| `20260726225537_init/` | 168 lines. The original schema: `users`, `workloads`, `devices`, `providers`, `benchmarks`, `benchmark_results`, `readiness_scores`, `rate_limits`, with their indexes and unique constraints |
| `20260822074319_nullable_hardware_fit_and_shared_findings/` | Makes `readiness_scores.hardware_fit` nullable, adds `privacy_class`, and creates `shared_findings` with indexes on `session_id` and `created_at`. Nullable hardware fit is what lets "not measured" stay `null` instead of becoming `0` |
| `20260822081030_optional_email_and_session_owner/` | Adds `users.session_id` with a unique index and makes `email` optional. This is what makes account-free row ownership possible |
| `20260823035500_drop_devices/` | 31 lines. Drops two foreign keys, the `benchmarks_device_id_idx` index, the `benchmarks.device_id` column, and the `devices` table |
| `20260823165500_warmup_iteration/` | Adds `benchmark_results.warmup BOOLEAN NOT NULL DEFAULT false`. The discarded cold-start iteration is stored and flagged, never deleted - the arithmetic can be checked from the rows |
| `20260826150000_session_events/` | Adds `session_events`: the activity log, one row per event keyed by the browser's session id, indexed by session and by time. The log had lived in server memory, which a hosted, multi-instance server does not keep between requests |
| [`20260826070000_reconcile_providers_and_rate_limits/`](20260826070000_reconcile_providers_and_rate_limits/FOLDER.md) | Conditional. Brings a database created from the team's original init (old `providers` columns, no `rate_limits`) up to this schema; a no-op on one already there. Written when the shared Neon database turned out to be in that state at deployment |
| `migration_lock.toml` | Provider lock. Not hand-edited |

## Connected folders

- [`prisma/`](../FOLDER.md) - the schema these migrations produce.
- [`scripts/db/`](../../scripts/db/FOLDER.md) - `neon.mjs`, the only sanctioned
  way to run these against the shared database.
- [`src/modules/benchmark/application/services/`](../../src/modules/benchmark/application/services/FOLDER.md) -
  the runner that writes the `warmup` flag.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`prisma/migrations/20260726225537_init/`](20260726225537_init/FOLDER.md)
- [`prisma/migrations/20260822074319_nullable_hardware_fit_and_shared_findings/`](20260822074319_nullable_hardware_fit_and_shared_findings/FOLDER.md)
- [`prisma/migrations/20260822081030_optional_email_and_session_owner/`](20260822081030_optional_email_and_session_owner/FOLDER.md)
- [`prisma/migrations/20260823035500_drop_devices/`](20260823035500_drop_devices/FOLDER.md)
- [`prisma/migrations/20260823165500_warmup_iteration/`](20260823165500_warmup_iteration/FOLDER.md)
- [`prisma/migrations/20260826070000_reconcile_providers_and_rate_limits/`](20260826070000_reconcile_providers_and_rate_limits/FOLDER.md)
- `src/app/api/v1/readiness/[id]/` ([FOLDER.md](../../src/app/api/v1/readiness/%5Bid%5D/FOLDER.md))
- [`src/app/api/v1/session-log/share/`](../../src/app/api/v1/session-log/share/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
