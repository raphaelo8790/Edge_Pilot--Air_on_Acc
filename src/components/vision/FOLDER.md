# `src/components/vision/` - bring your own dataset

**Work package:** vision benchmark.

## What this folder is

One component, and one strict rule: **the images never leave the machine.**

## What happened here

New. A user picks a folder laid out one directory per class
(`webkitdirectory`), and the component measures a real model against their own
photographs without a single image reaching the EdgePilot server. Resizing and
hashing happen in the tab; classification goes from the tab straight to the
user's own Ollama on localhost.

That is not a convenience decision. Benchmarking confidential data is this
project's stated non-goal, and sending images to a server to be resized would
have contradicted the warning the rest of the application gives.

Four things had to be got right, and three of them were got wrong first:

- **`labelOf` requires three path parts.** With two, a loose file sitting at the
  chosen root adopted the root folder's own name as its class.
- **The prompt comes from the dataset.** A deliberate failure run proved it:
  with the built-in seven-label prompt and a custom two-class dataset, the
  result was 0% accuracy and 100% invalid output. `buildVisionPrompt(labels)`
  builds the closed label set from whatever the user brought. Re-run properly
  with `red_panel`/`green_panel`: 100%, passed.
- **The metrics schema had to be widened.** `perClass` was pinned to exactly
  seven entries, so a different class count ran to completion and *then* failed
  validation.
- **Four declarations block the run** - SPDX licence text plus three privacy
  confirmations. A dataset with no stated licence and no confirmation of what is
  in the images is not one anybody should publish a metric from.

## Files

| File | What it is |
|---|---|
| `DatasetUpload.tsx` | 403 lines. Folder-per-class picker, `labelOf`, the four blocking declarations, prompt construction from the dataset's own labels, and evidence JSON download |

## Connected folders

- [`src/modules/vision-benchmark/infrastructure/`](../../modules/vision-benchmark/infrastructure/FOLDER.md) -
  `browser-image-processor.ts` and `browser-ollama-provider.ts`, the two
  adapters that exist so this can work in the tab.
- [`src/app/vision-benchmark/`](../../app/vision-benchmark/FOLDER.md) - the page
  that mounts it.
- [`src/modules/vision-benchmark/core/`](../../modules/vision-benchmark/core/FOLDER.md) -
  `buildVisionPrompt` and the widened schemas.
- [`datasets/vision-benchmark/`](../../../datasets/vision-benchmark/FOLDER.md) -
  the reference dataset this generalises away from.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/vision-benchmarks/`](../../app/api/v1/vision-benchmarks/FOLDER.md)
- [`src/components/`](../FOLDER.md)
- [`src/modules/vision-benchmark/`](../../modules/vision-benchmark/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
