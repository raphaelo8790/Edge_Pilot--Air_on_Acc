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
| `page.tsx` | The workload description, the reference table, and the mount points for both run panels |
| `actions.ts` | The server action that runs the built-in dataset on a CLOUD provider (Gemini or Groq) - the local run happens in the browser, see `components/vision/builtInDataset.ts`. Takes the provider, model, session id and the visitor's own keys as arguments, since a server action carries no request headers. Server-key runs are capped per visitor per hour (`core/quota`). Builds the request exactly as the CLI does; writes nothing server-side |
| `types.ts` | The action's result shape. Separate because a file marked `'use server'` may only export async functions - exporting an interface from one is a build error |

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
- [`src/core/quota/`](../../core/quota/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
