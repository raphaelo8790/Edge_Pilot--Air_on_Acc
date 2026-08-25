# `src/app/api/v1/vision-benchmarks/` - the vision workload endpoint

**Work package:** vision benchmark.

## What this folder is

`GET` and `POST /api/v1/vision-benchmarks` - run the image-classification
workload server-side, and list what has been run.

## What happened here

The route sets `runtime` explicitly, because the server-side image processor
uses `sharp`, a native module that cannot run on the edge runtime.

Its role narrowed rather than grew. It is now the *server* path for the vision
workload - used for the controlled dataset. When a user brings their own images,
nothing goes through this endpoint at all: the browser prepares the images and
talks straight to the user's own Ollama, so the photographs never leave the
machine.

## Files

| File | What it is |
|---|---|
| `route.ts` | 128 lines. `GET` and `POST`, with `dynamic` and `runtime` set |

## Connected folders

- [`src/modules/vision-benchmark/`](../../../../modules/vision-benchmark/FOLDER.md) -
  the module.
- [`src/modules/vision-benchmark/infrastructure/`](../../../../modules/vision-benchmark/infrastructure/FOLDER.md) -
  `run-service.ts` and the `sharp` processor.
- [`src/components/vision/`](../../../../components/vision/FOLDER.md) - the
  browser path that deliberately bypasses this route.
- [`tests/vision-benchmark/`](../../../../../tests/vision-benchmark/FOLDER.md) -
  `vision-api.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
