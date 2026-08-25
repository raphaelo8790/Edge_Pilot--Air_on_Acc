# `scripts/` - command-line entry points

**Work package:** shared, by subfolder.

## What this folder is

Everything invoked from `package.json` that is not `next` or `prisma` itself.
The dividing line against `src/` is deliberate: nothing here is imported by the
application, and nothing here runs in a request. These are operator tools -
they produce evidence, guard a shared database, or set up local state.

## What happened here

Three of the five subfolders are new. `db/` exists because a command aimed at
the shared database could silently run against localhost and report success.
`evaluation/` exists because the ten-case matrix the checklist asks for had no
home. `dev/` exists because the scaffold endpoints did not persist, so rows had
to be created from outside - and it survives now that they do, because driving
a run from curl still needs rows.

## Subfolders

| Subfolder | What is in it |
|---|---|
| [`benchmark/`](benchmark/FOLDER.md) | Real provider runs, failure captures, the clean-start log |
| [`db/`](db/FOLDER.md) | The guards around the shared Neon database |
| [`dev/`](dev/FOLDER.md) | Local helpers for seeding and inspecting rows |
| [`evaluation/`](evaluation/FOLDER.md) | The ten-case evaluation matrix |
| [`vision-benchmark/`](vision-benchmark/FOLDER.md) | Fixture generation, dataset validation, live and controlled runs |

## Connected folders

- [`evidence/`](../evidence/FOLDER.md) - almost everything here writes into it.
- [`/`](../FOLDER.md) - `package.json` is where these are named.
- [`src/modules/`](../src/modules/FOLDER.md) - the code these scripts drive.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/evidence/`](../src/app/evidence/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
