# Database

EdgePilot runs against two Postgres databases, and knowing which one you are
talking to is most of what there is to learn here.

Your **local database** is a Postgres container defined in
`docker-compose.yml`. It listens on your machine's `localhost:5432`, which means
it is private to you — `localhost` is your computer, and no Docker setting makes
another laptop reach it. Break it, wipe it, reset it freely; nobody else
notices.

The **shared database** is hosted (Neon). It has one hostname that everyone
connects to, so it is the only place where "the same rows" means the same rows
for the whole team. Treat it as production-shaped: additive changes, applied
deliberately.

Every developer uses both. Which one a command hits is decided by nothing more
than which env file the command reads.

## What travels through git

Structure travels. `prisma/schema.prisma` and the SQL files under
`prisma/migrations/` are committed, so when you pull and run
`npm run db:deploy`, your tables come out identical to everyone else's. This is
why `prisma/migrations/` must never be gitignored — without it, only the person
who wrote the change has the right tables, and everyone else silently drifts.

Rows do not travel. `docker compose up` creates a fresh, empty volume on each
machine. The reason everyone still starts with the same three providers is that
`prisma/seed.ts` is committed and everyone runs it.

## First-time local setup

```bash
cp .env.example .env      # defaults already match docker-compose.yml
bash setup-db.sh          # from WSL on Windows, not PowerShell
```

That starts the container, waits for it to report healthy, applies the committed
migrations, generates Prisma Client, and seeds the provider catalog. It is
idempotent — re-run it whenever you want.

Use `.env`, not `.env.local`. Next.js reads both, but the Prisma CLI reads only
`.env`, so a `DATABASE_URL` that lives in `.env.local` will leave
`prisma migrate` and `prisma db seed` complaining that the variable is missing.

## Everyday commands

```bash
npm run db:deploy    # apply committed migrations to your local database
npm run db:seed      # (re)seed the provider catalog — safe to repeat
npm run db:studio    # browse and edit rows at http://localhost:5555
npm run db:reset     # drop everything, re-migrate, re-seed (local only)
```

## Changing the schema

Edit `prisma/schema.prisma`, then create the migration against your own
database:

```bash
npx prisma migrate dev --name add_something_useful
```

That writes a new folder under `prisma/migrations/`. Commit the schema change
and that folder together, in the same commit — a schema without its migration is
the one thing that reliably breaks other people's setups. Open the PR as usual.

After the PR merges, one person applies it to the shared database:

```bash
npm run db:neon:deploy
```

## Rules for the shared database

Only ever run `migrate deploy` against it. Never `migrate dev`, and never
`migrate reset`. `migrate dev` does drift detection, and when it finds a
difference it offers to drop and recreate the database — on a shared host that
answer destroys everyone's data. `migrate dev` belongs in your local sandbox
only.

Don't run `prisma db push` against it either. `db push` reshapes tables to match
the schema without leaving a migration behind, so the shared database ends up in
a state no committed file describes and the next real migration fails on drift.
`db push` is fine for throwaway local experiments; migrations are what the team
ships.

```bash
npm run db:neon:deploy    # apply migrations
npm run db:neon:seed      # seed reference data
npm run db:neon:studio    # inspect it
```

## Getting access to the shared database

Credentials live in `.env.neon`. It is gitignored and is never in the repo, and it
should not travel through team chat either — a password pasted into a message is
burned the moment it is sent, and it stays in the history afterwards.

Instead, ask the project owner to add you as a collaborator on the Neon project:
**Neon Console → the project → Settings → Collaborators → Invite**, by email. You
then read your own connection string from the dashboard and write your own
`.env.neon` in the repository root:

<!-- prettier-ignore -->
    DATABASE_URL="postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    DIRECT_URL="postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

Two lines, each one unbroken line. The only difference between them is `-pooler`,
present in the first and absent from the second. Nothing else belongs in this file:
it is read only by the `db:neon:*` scripts, which hand it to the Prisma CLI.

Confirm git is ignoring it before you commit anything:

```bash
git check-ignore -v .env.neon    # should print the .gitignore rule that matches
```

If a connection string does leak — into chat, a screenshot, a pasted terminal log —
rotate it rather than hoping: Neon → the project → Reset password, then everyone
rewrites their `.env.neon`.

## Pooled and direct URLs

`DATABASE_URL` is what the running app uses. On Neon it is the pooled host, with
`-pooler` in the hostname; pooling is what keeps hundreds of short-lived
serverless connections from exhausting the database.

`DIRECT_URL` is what the Prisma CLI uses for migrations. It is the same string
with `-pooler` removed from the hostname. Schema changes cannot run through
pgBouncer, so a migration pointed at the pooled host either hangs or errors.

Both variables must be present in every env file, including local ones. Local
Docker has no pooler in front of it, so there the two values are identical.

## Schema conventions

Tables and columns are snake_case in the database and camelCase in TypeScript,
bridged by `@map()`. Changing a `@map()` value is an API-visible change:
`providers.is_active` is what `/api/v1/providers` returns as `is_active`.

Every foreign key has an index. Postgres indexes primary keys and unique columns
automatically but not the referencing side, so without these, listing one user's
benchmarks means a full table scan.

Deletes follow ownership. Anything a user owns — workloads, devices, benchmarks,
and the results and readiness scores hanging off them — is removed with the user
via `onDelete: Cascade`. Providers are the exception: they are shared catalog
data, not user-owned, and a provider that any recorded benchmark references
cannot be deleted at all. Retire one by setting `isActive = false` instead, so
the benchmark history keeps saying which provider produced it.

## When something goes wrong

`Can't reach database server at localhost:5432` means the container isn't
running. `docker compose up -d`, then `docker compose logs postgres` if it still
won't come up.

`Environment variable not found: DIRECT_URL` means your env file predates this
setup. Copy the line from `.env.example`; locally it's the same value as
`DATABASE_URL`.

`Drift detected` locally means your database and the migration history disagree,
usually because someone ran `db push` at some point. `npm run db:reset` fixes it
in seconds. If you see this against the shared database, stop and raise it in
the team chat rather than accepting any prompt.
