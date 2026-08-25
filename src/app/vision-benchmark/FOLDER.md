# `src/app/vision-benchmark/` - the vision dashboard route

**Work package:** vision benchmark.

## What this folder is

The `/vision-benchmark` route: the image-classification workload, its results,
and the bring-your-own-dataset panel.

## What happened here

Grew from 73 to 244 lines, almost all of it to host the dataset upload. That
feature is the reason the page has a client component in it at all.

The design rule the page has to respect: an uploaded image **never reaches the
EdgePilot server**. It is resized and hashed in the tab, and classified by
talking from the tab straight to the user's own Ollama on localhost. So the
page mounts a browser image processor and a browser provider rather than
posting files to an endpoint.

## Files

| File | What it is |
|---|---|
| `page.tsx` | 245 lines. The workload description, the results view, and the mount point for the dataset upload |

## Connected folders

- [`src/components/vision/`](../../components/vision/FOLDER.md) -
  `DatasetUpload.tsx`, the upload panel.
- [`src/modules/vision-benchmark/`](../../modules/vision-benchmark/FOLDER.md) -
  the module.
- [`src/components/dashboard/`](../../components/dashboard/FOLDER.md) -
  `VisionHandoff.tsx`, how a user arrives here from the benchmark dashboard.
- [`docs/vision-benchmark/`](../../../docs/vision-benchmark/FOLDER.md) - the
  workload specification.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
