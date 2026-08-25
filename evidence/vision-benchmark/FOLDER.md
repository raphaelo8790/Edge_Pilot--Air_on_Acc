# `evidence/vision-benchmark/` - image classification runs

**Work package:** vision benchmark.

## What this folder is

Four artefacts: two controlled runs against scripted providers, and two live
runs against a real model on real hardware.

Each carries the full reproducibility set - schema version, workload id and
version, dataset id, manifest version **and its SHA-256**, preprocessing
version, prompt version, execution mode, provider, model, git commit, start and
completion timestamps, every per-sample record, the metrics, the thresholds,
and whether it passed. Two runs are comparable only when those versions match,
which is why they are all recorded rather than assumed.

## What happened here

The two `live-*` files are new, and they are the first real measurements this
project has produced. Before them the live path had never worked: the evidence
writer validated filenames against a lowercase-only pattern and then built them
from an ISO timestamp containing `T` and `Z`, so every live run failed at the
write step.

The two live runs are the same model on the same images and differ by one
change - the second was taken after a warm-up classification was added, and its
median latency is **529.6 ms against the first run's 1322.1 ms**. That gap is
the model load, not the model.

`.gitignore` ignores `live-*.json` by default, because live runs are
machine-specific and would otherwise accumulate from every developer. The
second one is explicitly un-ignored, with the reason written beside the rule.

## Files

| File | What it is |
|---|---|
| `live-ollama-llava-latest-2026-08-23t20-03-01-476z.json` | **The reference measurement.** `llava:latest`, 21 samples, 14 correct: 66.7% accuracy, macro-F1 0.667, 0% invalid output, 100% request success, median 529.6 ms, p95 721.4 ms. `"passed": false` - it fails its own 0.80 accuracy and 0.75 macro-F1 gates. Committed *because* it fails |
| `live-ollama-llava-latest-2026-08-23t19-25-20-341z.json` | The earlier run, before warm-up. Median 1322.1 ms. Git-ignored |
| `controlled-ollama.json` | Deterministic run against a scripted local provider - proves the pipeline, not the model |
| `controlled-gemini.json` | The same for the cloud provider shape |

## Connected folders

- [`datasets/vision-benchmark/`](../../datasets/vision-benchmark/FOLDER.md) -
  the 21 samples these measure.
- [`scripts/vision-benchmark/`](../../scripts/vision-benchmark/FOLDER.md) -
  `run.ts` writes the live files, `generate-controlled-evidence.ts` the others.
- [`src/modules/vision-benchmark/infrastructure/`](../../src/modules/vision-benchmark/infrastructure/FOLDER.md) -
  `evidence-store.ts`, the file that had the filename bug.
- [`src/app/evidence/`](../../src/app/evidence/FOLDER.md) - renders them.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`docs/vision-benchmark/`](../../docs/vision-benchmark/FOLDER.md)
- [`evidence/`](../FOLDER.md)
- [`src/modules/vision-benchmark/`](../../src/modules/vision-benchmark/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
