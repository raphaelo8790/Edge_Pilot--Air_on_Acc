# `src/app/api/v1/vision-benchmarks/dataset/` - the built-in dataset, for a browser

**Work package:** vision benchmark.

## What this folder is

`GET /api/v1/vision-benchmarks/dataset` describes the reference dataset -
samples, labels, prompt and version, manifest digest - and
`dataset/images/<file>` serves one fixture image.

## What happened here

New with hosting. The built-in run used to be a server action calling the
server's Ollama. Hosted, there is no such Ollama; the only one a visitor can
measure is their own, and only their browser can reach it. So the browser
needs what the server's run-service reads from disk, and these two routes
hand it over. Only a file the manifest names is served, matched against the
manifest's own list rather than joined onto a directory.

## Files

| File | What it is |
|---|---|
| `route.ts` | `GET`. The manifest as the executor expects it, each sample with the URL its image is fetched from |
| `images/[file]/route.ts` | `GET`. One PNG, `image/png`, cacheable for the session |

## Connected folders

- [`src/components/vision/`](../../../../../components/vision/FOLDER.md) -
  `builtInDataset.ts`, the browser-side run these serve.
- [`datasets/vision-benchmark/`](../../../../../../datasets/vision-benchmark/FOLDER.md) -
  the files.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/vision-benchmarks/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
