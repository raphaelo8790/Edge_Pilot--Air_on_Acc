# `datasets/` - benchmark input data

**Work package:** vision benchmark.

## What this folder is

The controlled data a benchmark is run against. One dataset lives here today,
for the vision workload.

## What happened here

Not restructured. What changed is what the code around it will now accept: the
vision module used to require exactly this dataset's seven labels, and a
dataset with a different number of classes would run to completion and then
fail validation. That restriction was removed, so this folder is now the
project's *reference* dataset rather than its only possible one - a user can
supply their own from the browser, and it never touches the server.

## Files

Subfolder only. See [`vision-benchmark/`](vision-benchmark/FOLDER.md).

## Connected folders

- [`datasets/vision-benchmark/`](vision-benchmark/FOLDER.md) - the dataset itself.
- [`src/modules/vision-benchmark/`](../src/modules/vision-benchmark/FOLDER.md) -
  the code that loads and measures against it.
- [`scripts/vision-benchmark/`](../scripts/vision-benchmark/FOLDER.md) - the
  generator that produces the images and the validator that checks them.
- [`docs/vision-benchmark/`](../docs/vision-benchmark/FOLDER.md) - the dataset
  card and workload specification.

<p align="right"><sub><i>Adham Yakout</i></sub></p>
