# `src/modules/vision-benchmark/` - image classification benchmarks

**Work package:** vision benchmark.

## What this folder is

The second domain module, with the same three layers as the benchmark module
and its own copy of the transport helpers - deliberately a copy, so the two
modules can change independently.

Its job is narrower and stricter than the text benchmark's: send an image, get
back one label from a closed set, and score the result against a manifest whose
SHA-256 is recorded so two runs can be compared only when they measured the same
thing.

## What happened here

Two changes of a completely different size, and the smaller one mattered more.

**The one-character fix.** `evidence-store.ts` validated filenames against
`/^[a-z0-9._-]+\.json$/` - lowercase only - and then built the filename from an
ISO timestamp containing an uppercase `T` and `Z`. Every live run failed at the
write step. The live path had **never worked, once**. One `.toLowerCase()` is
the reason this project has any real measurement at all.

**The generalisation.** The module now accepts arbitrary label sets, so a user
can measure a model against their own images. That required widening six
fields - TypeScript interfaces and zod schemas together - and building the
prompt from the dataset's own labels rather than a fixed seven. All three
pre-existing evidence files were re-parsed afterwards to confirm nothing broke.

**The warm-up.** The first sample was paying the model-load cost. Median latency
across the dataset fell from 1322.1 ms to 529.6 ms once a warm-up classification
ran first - the same model, the same images.

## Files

| File | What it is |
|---|---|
| `index.ts` | 17 lines. The module's public surface |

## Subfolders

| Layer | What is in it |
|---|---|
| [`core/`](core/FOLDER.md) | Types, schemas, metrics, normalisation, the workload prompt |
| [`application/`](application/FOLDER.md) | Executor, evaluator, dashboard projection, the provider port |
| [`infrastructure/`](infrastructure/FOLDER.md) | Server and browser adapters, image processing, manifest loading, evidence writing |

## Connected folders

- [`src/app/vision-benchmark/`](../../app/vision-benchmark/FOLDER.md) - the page.
- [`src/app/api/v1/vision-benchmarks/`](../../app/api/v1/vision-benchmarks/FOLDER.md) -
  the server-side endpoint.
- [`src/components/vision/`](../../components/vision/FOLDER.md) - the browser path.
- [`datasets/vision-benchmark/`](../../../datasets/vision-benchmark/FOLDER.md),
  [`evidence/vision-benchmark/`](../../../evidence/vision-benchmark/FOLDER.md),
  [`scripts/vision-benchmark/`](../../../scripts/vision-benchmark/FOLDER.md),
  [`docs/vision-benchmark/`](../../../docs/vision-benchmark/FOLDER.md),
  [`tests/vision-benchmark/`](../../../tests/vision-benchmark/FOLDER.md).

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`datasets/`](../../../datasets/FOLDER.md)
- [`docs/`](../../../docs/FOLDER.md)
- [`src/modules/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
