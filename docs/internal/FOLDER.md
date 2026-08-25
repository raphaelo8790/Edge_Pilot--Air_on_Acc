# `docs/internal/` - maintainer documentation

**Work package:** integration and API surface, with `benchmark-api.md`
belonging to the benchmark layer.

## What this folder is

Documentation aimed at people working *on* the codebase rather than using it:
architecture, database, the wire contract, and how the team works.

## What happened here

`README.md` was updated to describe the current document set.

`benchmark-api.md` remains the authoritative wire contract - the dashboard's
typed gateway names it in its own header as the thing it is written against,
including the awkward cases: "all providers failed but the run is still
evidence", and `persisted: false`.

`database.md` is **stale and known to be stale**. Line 147 still describes users
owning "devices", a table that no longer exists, and the document does not
mention four things that do: `shared_findings`, `users.session_id`,
`benchmark_results.warmup`, and `readiness_scores.privacy_class`. It is listed
in section 6 of `00-PROJECT-RECORD.md` rather than silently patched, because a
documentation gap that is written down is a task and one that is not is a trap.

## Files

| File | What it is |
|---|---|
| `architecture.md` | 401 lines. Hexagonal architecture, module boundaries, data flow, schema notes |
| `benchmark-api.md` | 317 lines. Every endpoint of the benchmark layer with exact request and response shapes, every status code, and the eight error codes. Includes why ownership failures return 403 rather than 404 |
| `database.md` | 167 lines. Local versus shared database, migrations, seeding, conventions. Currently stale - see above |
| `team-workflow.md` | 367 lines. Branching, issue templates, PR process and size limits, review checklist, conventional commits, daily standup, hotfix procedure |
| `project-plan.md` | 28 lines. Internal milestones and evaluation notes |
| `Documentation.md` | 45 lines. An earlier overview of the framework |
| `README.md` | 27 lines. Index of this folder and pointers to the public-facing documents |

## Connected folders

- [`prisma/`](../../prisma/FOLDER.md) - the schema `database.md` describes.
- [`src/app/api/v1/`](../../src/app/api/v1/FOLDER.md) - the endpoints
  `benchmark-api.md` specifies.
- [`docs/benchmark/`](../benchmark/FOLDER.md) - the module guide that refers
  back to the wire contract.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`docs/`](../FOLDER.md)
- [`docs/dashboard/`](../dashboard/FOLDER.md)
- [`scripts/db/`](../../scripts/db/FOLDER.md)
- [`src/`](../../src/FOLDER.md)
- [`src/app/api/`](../../src/app/api/FOLDER.md)
- [`src/app/api/v1/benchmarks/`](../../src/app/api/v1/benchmarks/FOLDER.md)
- [`src/modules/`](../../src/modules/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
