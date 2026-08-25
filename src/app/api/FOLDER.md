# `src/app/api/` - the HTTP API

**Work package:** integration and API surface.

## What this folder is

Route handlers. One version namespace, `v1`.

## What happened here

`api/auth/` was removed along with the auth pages. Everything else lives one
level down.

## Subfolders

| Subfolder | What it is |
|---|---|
| [`v1/`](v1/FOLDER.md) | The versioned API - nine endpoints |

## Connected folders

- [`src/app/api/v1/`](v1/FOLDER.md) - the endpoints.
- [`docs/internal/`](../../../docs/internal/FOLDER.md) - `benchmark-api.md` is
  the authoritative wire contract.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
