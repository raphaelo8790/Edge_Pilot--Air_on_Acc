# `prisma/` - database schema, migrations and seed

**Work package:** integration and API surface. The four newest migrations came
out of the benchmark and DevOps work.

## What this folder is

The single definition of the database. Table and column names are `snake_case`
in Postgres and `camelCase` in TypeScript; the `@map()` directives in the schema
do the translation, which is why nothing in the repository layer has to.

That mapping is contractual, not cosmetic. `providers.is_active` is what
`/api/v1/providers` returns as `is_active`, so renaming a `@map()` value
without a migration breaks the wire contract as well as the database.

## What happened here

Four migrations were added, and one of them removes a table rather than adding
one.

The schema grew by 32 lines net (167 to 199), but the shape of the change
matters more than the size: `benchmarks.device_id` and the whole `devices` table
are gone, `users.session_id` arrived so rows can be owned without accounts,
`benchmark_results.warmup` arrived so a discarded cold-start iteration can be
kept and marked rather than deleted, `readiness_scores.hardware_fit` became
nullable so "not measured" stops being reported as a score, and
`readiness_scores.privacy_class` arrived because privacy became an ordinal class
instead of a number in an average.

`seed.ts` shrank from 127 lines to 56 - the device seed data went with the
table.

**The operational rule, which matters more than any of this:** against the
shared Neon database, only ever run `migrate deploy`. Never `migrate dev`,
which can offer to reset and would wipe everyone's data. The `db:neon:*` scripts
in [`scripts/db/`](../scripts/db/FOLDER.md) exist to enforce that.

## Files

| File | What it is |
|---|---|
| `schema.prisma` | 199 lines. Seven models: `User`, `Workload`, `Provider`, `Benchmark`, `BenchmarkResult`, `ReadinessScore`, `SharedFinding`, plus `rate_limits`. Carries `///` doc comments explaining the non-obvious columns |
| `seed.ts` | 56 lines. The provider catalogue every environment starts with. Safe to re-run: `upsert()` with an empty `update` leaves an existing row exactly as it is, so re-seeding never duplicates a provider and never clobbers a deliberate local change |
| [`migrations/`](migrations/FOLDER.md) | Five ordered migrations plus the lock file |

## Connected folders

- [`prisma/migrations/`](migrations/FOLDER.md) - the ordered history.
- [`src/lib/`](../src/lib/FOLDER.md) - `prisma.ts`, the single client for the process.
- [`src/modules/benchmark/infrastructure/repositories/`](../src/modules/benchmark/infrastructure/FOLDER.md) -
  the only code that talks to Prisma for benchmarks.
- [`scripts/db/`](../scripts/db/FOLDER.md) - the guards around the shared database.
- [`docs/internal/`](../docs/internal/FOLDER.md) - `database.md`, currently stale.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`/`](../FOLDER.md)
- [`prisma/migrations/20260726225537_init/`](migrations/20260726225537_init/FOLDER.md)
- [`prisma/migrations/20260822074319_nullable_hardware_fit_and_shared_findings/`](migrations/20260822074319_nullable_hardware_fit_and_shared_findings/FOLDER.md)
- [`prisma/migrations/20260822081030_optional_email_and_session_owner/`](migrations/20260822081030_optional_email_and_session_owner/FOLDER.md)
- [`prisma/migrations/20260823035500_drop_devices/`](migrations/20260823035500_drop_devices/FOLDER.md)
- [`prisma/migrations/20260823165500_warmup_iteration/`](migrations/20260823165500_warmup_iteration/FOLDER.md)
- [`scripts/dev/`](../scripts/dev/FOLDER.md)
- [`src/`](../src/FOLDER.md)
- [`src/app/api/v1/providers/`](../src/app/api/v1/providers/FOLDER.md)
- [`src/app/api/v1/workloads/`](../src/app/api/v1/workloads/FOLDER.md)
- [`src/modules/benchmark/core/entities/`](../src/modules/benchmark/core/entities/FOLDER.md)
- [`src/modules/benchmark/infrastructure/repositories/`](../src/modules/benchmark/infrastructure/repositories/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
