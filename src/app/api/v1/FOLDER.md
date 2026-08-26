# `src/app/api/v1/` - the versioned API

**Work package:** integration and API surface, with individual routes belonging
to their modules.

## What this folder is

Eleven endpoints. Every one of them follows the same envelope -
`{ success, data }` on the way out, `{ success: false, error, details }` on
failure - because the dashboard renders exactly one error shape and any
deviation costs a special case in the UI.

None of these files constructs an adapter, reads an environment variable, or
touches Prisma directly. They ask
[`src/modules/benchmark/infrastructure/container.ts`](../../../modules/benchmark/infrastructure/FOLDER.md)
for a wired use case and get one. That is what keeps a route to parse, dispatch
and choose a status code.

## What happened here

Four endpoints are new - `comparisons`, `local-runtime`, `session-log` and
`session-log/share`. One was removed - `devices`. And one, `workloads`, was
fixed from a scaffold that never called the database at all.

Ownership across all of them moved from a single hardcoded shared user to a
per-session user derived from the `x-edgepilot-session` header. Under the old
behaviour a hosted deployment would have handed every visitor every other
visitor's rows.

## Subfolders

| Endpoint | What it does |
|---|---|
| [`benchmarks/`](benchmarks/FOLDER.md) | `POST` run and record; `GET` list for one owner |
| [`comparisons/`](comparisons/FOLDER.md) | `POST` compare two or more models |
| [`local-runtime/`](local-runtime/FOLDER.md) | `GET` is Ollama running, and what does it have |
| [`providers/models/`](providers/models/FOLDER.md) | `GET ?provider=gemini\|groq` — which models the server's key for that vendor may run. The cloud counterpart of `local-runtime` |
| [`providers/`](providers/FOLDER.md) | `GET` the provider catalogue and what is configured |
| [`readiness/`](readiness/FOLDER.md) | `GET` the readiness score for one benchmark |
| [`session-log/`](session-log/FOLDER.md) | `GET` export, `DELETE` discard |
| [`vision-benchmarks/`](vision-benchmarks/FOLDER.md) | `GET`/`POST` the vision workload |
| [`workloads/`](workloads/FOLDER.md) | `POST` create a workload row; `GET` list |

## Connected folders

- [`src/modules/benchmark/infrastructure/`](../../../modules/benchmark/infrastructure/FOLDER.md) -
  the composition root every route calls.
- [`src/lib/`](../../../lib/FOLDER.md) - `sessionOwner.ts`, how these routes
  decide who owns a row.
- [`docs/internal/`](../../../../docs/internal/FOLDER.md) - the wire contract.
- [`tests/benchmark/`](../../../../tests/benchmark/FOLDER.md) -
  `benchmarks-route.test.ts` drives the main route with the container mocked.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/`](../FOLDER.md)
- [`src/components/dashboard/`](../../../components/dashboard/FOLDER.md)
- [`src/modules/`](../../../modules/FOLDER.md)
- [`src/shared/`](../../../shared/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
