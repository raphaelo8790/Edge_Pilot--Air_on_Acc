# `src/app/api/v1/providers/models/` - a cloud provider's model list

**Work package:** benchmark and provider layer.

## What this folder is

`GET /api/v1/providers/models?provider=gemini|groq` - which models the key
for that vendor may run. The cloud counterpart of `local-runtime`.

## What happened here

New. The provider step used to say a cloud vendor "does not publish its
catalogue over the API" and offered a free-text box with a hardcoded list of
suggested names, one of which was already out of date. Both vendors do publish
it, under the same key used for generation. This route asks, narrows the
answer to text generators (audio, embedding and safety models are counted and
left out), and marks which accept an image so the vision page can narrow
further. The visitor's own key is used when they set one; otherwise the
server's. The query is validated with Zod; no key appears in the response.

## Files

| File | What it is |
|---|---|
| `route.ts` | `GET`. Reads the provider name, builds a `CloudCatalog`, returns models with `context_window` and `supports_vision` |

## Connected folders

- [`src/modules/benchmark/infrastructure/`](../../../../../modules/benchmark/infrastructure/FOLDER.md) -
  `CloudCatalog.ts` and `visitor-keys.ts`.
- [`src/app/api/v1/providers/`](../FOLDER.md) - the parent listing.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/providers/`](../FOLDER.md)
- [`src/app/api/v1/`](../../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
