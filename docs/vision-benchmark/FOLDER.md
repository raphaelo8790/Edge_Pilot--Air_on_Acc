# `docs/vision-benchmark/` - vision module documentation

**Work package:** vision benchmark.

## What this folder is

Seven documents covering the vision workload end to end: what the dataset is,
what the workload specifies, how to execute it against a provider, what the
test cases are, and how to deliver it.

## What happened here

Not rewritten. Two things in here now describe behaviour that has changed
underneath them and should be read with that in mind:

- The **dataset card** describes the seven-label construction dataset as the
  workload's dataset. That is still the reference dataset, but the module no
  longer requires seven labels - a user can bring their own classes from the
  browser.
- The **workload specification** fixes the prompt. The prompt is now built from
  whatever label set the dataset declares (`buildVisionPrompt(labels)`), which
  a deliberate failure run proved was necessary: with the fixed prompt and a
  custom two-class dataset the result was 0% accuracy and 100% invalid output.

## Files

| File | What it is |
|---|---|
| `dataset-card.md` | 89 lines. Identity, provenance, licence, generation method, privacy checks |
| `workload-specification.md` | 126 lines. What the workload sends, what it expects back, the thresholds it is graded against |
| `provider-execution.md` | 106 lines. Prerequisites and how to run against Ollama or Gemini |
| `test-cases.md` | 60 lines. The 48 documented cases in the automated suite |
| `evidence-report.md` | 50 lines. Automated verification summary |
| `live-modification-demo.md` | 51 lines. A worked demonstration of changing the workload and seeing the measurement move |
| `pr-delivery.md` | 47 lines. Suggested pull-request title and body |

## Connected folders

- [`src/modules/vision-benchmark/`](../../src/modules/vision-benchmark/FOLDER.md) -
  the module.
- [`datasets/vision-benchmark/`](../../datasets/vision-benchmark/FOLDER.md) -
  the dataset the card describes.
- [`evidence/vision-benchmark/`](../../evidence/vision-benchmark/FOLDER.md) -
  the runs, including the one that fails its gate.
- [`scripts/vision-benchmark/`](../../scripts/vision-benchmark/FOLDER.md) - the
  commands `provider-execution.md` documents.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`datasets/`](../../datasets/FOLDER.md)
- [`docs/`](../FOLDER.md)
- [`src/app/vision-benchmark/`](../../src/app/vision-benchmark/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
