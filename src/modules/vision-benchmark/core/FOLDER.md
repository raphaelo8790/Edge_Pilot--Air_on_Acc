# `src/modules/vision-benchmark/core/` - the vision domain

**Work package:** vision benchmark.

## What this folder is

Five files defining what a vision benchmark **is**: the sample and evidence
shapes, the zod schemas that validate them, the metric calculations, the label
normaliser, and the prompt.

## What happened here

This is where the generalisation to arbitrary datasets was actually done, and
where it went wrong first.

`schemas.ts` had `perClass` pinned to `.length(VISION_LABELS.length)` - exactly
seven. A dataset with a different class count ran to completion and *then*
failed validation, which is the worst possible ordering: all the cost, none of
the result. Widening it needed six fields changed across `types.ts` and
`schemas.ts` **together**; changing one without the other cost three separate
`next build` round-trips, because Jest type-checks only what it imports.

`workload.ts` grew from 10 lines to 31 for `buildVisionPrompt(labels)`. A
deliberate failure run proved it was necessary: with the fixed seven-label
prompt and a custom two-class dataset, the result was 0% accuracy and 100%
invalid output. Re-run with a prompt built from the dataset's own labels:
100%, passed.

`normalization.ts` is the security-relevant file here. EdgePilot never *acts* on
model output, so the threat is not execution - it is output being read as a
**verdict**. The defence is exact matching against a closed label set, with
anything else recorded as `invalid_output` rather than guessed at.

**Hosted-mode pass.** `VisionBenchmarkRunRequestSchema` accepts `provider: 'groq'` alongside `ollama` and `gemini`.

## Files

| File | What it is |
|---|---|
| `types.ts` | 202 lines. `VisionBenchmarkSample`, `VisionBenchmarkEvidence`, `ClassMetrics`, `VisionDashboardRow`, `VISION_LABELS`, `VISION_DATASET_ID`, `VISION_WORKLOAD_ID` |
| `schemas.ts` | 278 lines. The zod counterparts, including the manifest and evidence schemas |
| `metrics.ts` | 171 lines. Exact-match accuracy, macro precision/recall/F1, invalid-output rate, successful-request rate, median and p95 latency, throughput, and the per-class matrix |
| `normalization.ts` | 60 lines. `normalizeVisionLabel` - exact matching against the closed set |
| `workload.ts` | 32 lines. `buildVisionPrompt(labels)`, `VISION_BENCHMARK_PROMPT`, and the prompt and workload version constants that make two runs comparable |

## Connected folders

- [`../application/`](../application/FOLDER.md) - the executor and evaluator.
- [`../infrastructure/`](../infrastructure/FOLDER.md) - what produces the
  evidence these schemas validate.
- [`src/components/vision/`](../../../components/vision/FOLDER.md) - the upload
  that calls `buildVisionPrompt` with a user's own labels.
- [`evidence/evaluation/`](../../../../evidence/evaluation/FOLDER.md) - the
  injection cases drive `normalizeVisionLabel` directly.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`scripts/evaluation/`](../../../../scripts/evaluation/FOLDER.md)
- [`src/modules/vision-benchmark/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
