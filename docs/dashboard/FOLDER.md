# `docs/dashboard/` - dashboard module documentation

**Work package:** product UI and benchmark dashboard / integration lead.

## What this folder is

One document describing the dashboard as a module: the user journey, the design
decisions, and - usefully - the dependency requests it made of the other work
packages.

## What happened here

The document was not rewritten, and reading it now is the clearest single view
of what changed in this project, because several of its open requests have
since been closed:

- *"`POST /api/v1/workloads` currently echoes `temp-*-id` and does not
  persist"* - fixed; the route writes real rows.
- *"the dashboard detects the placeholder ids and accepts an existing database
  UUID instead"* - that fallback path is gone, along with the UUID field.
- *"A `user_id`-less benchmark history needs sessions"* - sessions exist.

The document also records the two decisions that survived unchanged and are
worth keeping: one typed gateway for every request, and client validation that
mirrors rather than replaces server validation.

## Files

| File | What it is |
|---|---|
| `README.md` | 70 lines. The four-step user journey, the design decisions (one typed gateway, module-scoped styling under `.epd`, mirrored validation, accessibility), and the dependency requests to the other work packages |

## Connected folders

- [`src/components/dashboard/`](../../src/components/dashboard/FOLDER.md) - the
  components described.
- [`src/app/dashboard/`](../../src/app/dashboard/FOLDER.md) - the route and its
  stylesheet.
- [`docs/internal/`](../internal/FOLDER.md) - `benchmark-api.md`, the contract
  the dashboard is written against.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`docs/`](../FOLDER.md)
- [`src/components/`](../../src/components/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
