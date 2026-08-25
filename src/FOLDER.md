# `src/` - the application

**Work package:** shared, by subfolder.

## What this folder is

Everything `next build` compiles. Five top-level divisions, and the division is
the architecture:

- `app/` - HTTP. Routes and pages, nothing else.
- `components/` - React. What the user sees.
- `modules/` - the two domain modules, each with its own core / application /
  infrastructure layers.
- `core/`, `lib/`, `shared/` - things genuinely used by more than one module.

## What happened here

Two structural simplifications, both of them removals.

`src/data/` was deleted. It was a second data-access path sitting beside
`src/modules/*/infrastructure/repositories/`, which meant the project had two
answers to "where does database access live" - and two answers is the same as
none.

`src/core/rate-limit/` and `src/core/security/` were deleted. They guarded
endpoints that have no authentication and no public URL. Security machinery
that protects nothing still has to be read, maintained and reasoned about by
everyone who comes after.

`src/core/logging/` gained `SessionLog.ts`, which replaced a generic
`logger.ts` with something that has an actual policy - a redaction rule, an
export format, and opt-in behaviour.

## Subfolders

| Subfolder | What it holds |
|---|---|
| [`app/`](app/FOLDER.md) | Routes and pages - the HTTP surface |
| [`components/`](components/FOLDER.md) | React components |
| [`modules/`](modules/FOLDER.md) | The benchmark and vision-benchmark domain modules |
| [`core/`](core/FOLDER.md) | Cross-cutting concerns - currently the session log |
| [`lib/`](lib/FOLDER.md) | The Prisma client and session ownership |
| [`shared/`](shared/FOLDER.md) | Types shared across module boundaries |

## Connected folders

- [`tests/`](../tests/FOLDER.md) - mirrors this tree.
- [`prisma/`](../prisma/FOLDER.md) - the schema the repositories map onto.
- [`docs/internal/`](../docs/internal/FOLDER.md) - `architecture.md` describes
  these boundaries in full.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
