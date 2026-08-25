# `src/app/api/v1/providers/` - the provider catalogue

**Work package:** benchmark and provider layer.

## What this folder is

`GET /api/v1/providers` - which providers exist, and whether each is usable on
this server right now.

## What happened here

The behaviour worth knowing is what it does when the database is **not**
reachable. It still answers, from the registry alone, with `provider_id: null`
and a message explaining why. The dashboard can still render the list and say
which providers are configured. Degrading to a useful answer beats returning a
500 for a question that does not strictly need the database.

No credential, and no fragment of one, appears in the response.

## Files

| File | What it is |
|---|---|
| `route.ts` | 92 lines. `GET`, returning the catalogue with `is_configured`, `configuration_hint`, database availability, and server configuration warnings |

## Connected folders

- [`src/modules/benchmark/infrastructure/providers/`](../../../../modules/benchmark/infrastructure/providers/FOLDER.md) -
  `ProviderRegistry.ts`.
- [`prisma/`](../../../../../prisma/FOLDER.md) - `seed.ts` is what puts the
  catalogue rows there.
- [`src/components/dashboard/`](../../../../components/dashboard/FOLDER.md) -
  `ProviderPanel.tsx`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/`](../FOLDER.md)
- [`src/modules/benchmark/`](../../../../modules/benchmark/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
