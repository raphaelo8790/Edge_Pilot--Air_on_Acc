# Vision Benchmark Workload Specification

## Workload

`construction-component-recognition-v1`

This bounded workload evaluates closed-set recognition of one primary
construction-safety component per image. It is an image-classification
workload, not an object-detection workload. Version 1 does not request
bounding boxes, segmentation masks, tracking, or multi-object scene analysis.

## Supported labels

- `hardhat`
- `safety_vest`
- `gloves`
- `goggles`
- `mask`
- `ladder`
- `safety_cone`

## Dataset boundary

The controlled dataset contains 21 deterministic synthetic PNG files: three
for each supported label. The generator, manifest, license, privacy review,
and SHA-256 values are documented in
[`dataset-card.md`](dataset-card.md).

The controlled dataset validates the benchmark system. It is not representative
of real construction sites and cannot support production-accuracy claims.

## Image preprocessing

Before provider execution, the module:

1. Resolves each image beneath the repository root.
2. Rejects symbolic links and path traversal.
3. Enforces a 10 MiB source limit and safe pixel limits.
4. Verifies the source SHA-256 against the manifest.
5. Accepts PNG, JPEG, and WebP single-frame images.
6. Rejects EXIF, XMP, and IPTC metadata.
7. Applies EXIF-aware orientation handling.
8. Resizes within 512 × 512 without enlargement.
9. Converts to PNG while stripping metadata.

Sharp removes metadata by default when producing output buffers:
[Sharp output documentation](https://sharp.pixelplumbing.com/api-output/).

## Response policy

A provider response is accepted only when the complete normalized response maps
to exactly one supported label.

Normalization:

1. Trims surrounding whitespace.
2. Removes one matching pair of surrounding quotes.
3. Converts text to lowercase.
4. Converts spaces and hyphens to underscores.
5. Maps `hard_hat` to `hardhat`.
6. Rejects explanations and unsupported values.

Invalid output is measured separately and is never treated as a ground-truth
class.

## Deterministic metrics

The module calculates:

- Exact-match accuracy.
- Macro precision.
- Macro recall.
- Macro F1.
- Per-class precision, recall, F1, and support.
- Invalid-output rate.
- Successful-request rate.
- Median latency.
- P95 latency using nearest rank.
- Sequential throughput.

Macro metrics include classes represented in the evaluated ground truth. The
ready manifest guarantees all seven classes are represented.

## Quality thresholds

- Accuracy greater than or equal to `0.80`.
- Macro F1 greater than or equal to `0.75`.
- Invalid-output rate less than or equal to `0.05`.
- Successful-request rate greater than or equal to `0.95`.

## Provider execution

The image-capable `VisionProvider` port is separate from the shared text-only
provider port.

- `OllamaVisionProvider` calls the local `/api/chat` endpoint with base64 image
  data, streaming disabled, temperature `0`, and seed `42`.
- `GeminiVisionProvider` calls the HTTPS Interactions API with inline PNG data,
  a label-enum response schema, and minimal thinking.
- `executeVisionBenchmark` processes samples sequentially, preserves sample
  order, records failures, and produces schema-validated evidence.

Ollama documents image arrays for vision models in its
[Vision guide](https://docs.ollama.com/capabilities/vision). Gemini documents
inline image data, classification, supported formats, and the Interactions API
in its
[Image understanding guide](https://ai.google.dev/gemini-api/docs/image-understanding).

## Evidence boundary

Every evidence file records:

- Workload, dataset, manifest, preprocessing, and prompt versions.
- Manifest SHA-256.
- Controlled or live execution mode.
- Provider kind, provider, model, device profile, and commit SHA.
- Per-sample predictions and latency.
- Aggregate and per-class metrics.
- Thresholds, pass/fail status, and limitations.

Controlled evidence proves deterministic local/cloud integration without
claiming real provider performance. Live evidence is created only when the
Ollama or Gemini command actually executes.

The dashboard receives a reduced, validated comparison row derived from the
full evidence object.
