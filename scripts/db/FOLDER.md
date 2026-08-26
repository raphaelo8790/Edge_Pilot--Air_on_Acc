# `scripts/db/` - shared-database guards

**Work package:** DevOps.

## What this folder is

Two files whose entire purpose is to stop a command aimed at the shared Neon
database from quietly running somewhere else.

## What happened here

This folder is new, and it exists because of a specific failure that is easy
to miss and expensive to discover late.

`dotenv -e .env.neon -- prisma migrate deploy` fails **silently** when
`.env.neon` is absent. dotenv-cli loads nothing, Prisma falls back to its own
`.env`, and a command named "neon" runs against localhost while printing "No
pending migrations to apply." Nothing about the output says the target was
wrong.

The inverse is worse: a file that is present but points somewhere unexpected
lets a command that looks local reach a shared database, and `migrate` against
the wrong database is not something you can recover from by reading the output
afterwards.

A second, smaller problem: flags did not survive the trip. `npx dotenv -e f --
prisma migrate resolve --applied X` loses `--applied` somewhere between npx,
dotenv-cli and the shell, and Prisma then complains about a flag you clearly
passed.

## Files

| File | What it is |
|---|---|
| `inspect-neon.mjs` | Prints the tables and columns the shared database actually has, plus its recorded migration history - names only, never rows. For when `migrate deploy` says nothing is pending and the schema disagrees |
| `neon.mjs` | 126 lines. The single entry point for Prisma commands against the shared database. Reads the env file itself, sets the variables, **prints the destination host before doing anything**, and passes flags through intact. Backs `db:neon`, `db:neon:deploy`, `db:neon:seed`, `db:neon:studio`, `db:neon:status` |
| `require-env-file.mjs` | 71 lines. Refuses to proceed unless `.env.neon` exists, parses, and names a host that is not local |

## The rule these enforce

Against the shared database, only `migrate deploy`. Never `migrate dev` - it
can offer to reset, and a reset wipes everyone's data.

## Connected folders

- [`prisma/`](../../prisma/FOLDER.md) and
  [`prisma/migrations/`](../../prisma/migrations/FOLDER.md) - what these
  commands apply.
- [`docs/internal/`](../../docs/internal/FOLDER.md) - `database.md` describes
  the local-versus-shared split.
- [`/`](../../FOLDER.md) - `.env.example` documents the variables;
  `.env.neon` itself is never committed.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`scripts/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
