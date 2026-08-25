# Vision Benchmark Evidence Report

## Automated verification

| Check | Result |
|---|---|
| Dataset generation and SHA-256 verification | Pass |
| Dataset runtime validation | Pass |
| TypeScript strict check | Pass |
| Jest suites | 5 passed |
| Documented automated cases | 48 passed |
| Lint | Pass: 0 errors; 13 pre-existing warnings outside the vision module |
| Next.js production build | Pass |

## Controlled comparison

The committed evidence is deterministic integration evidence, not live model
performance.

| Provider boundary | Mode | Samples | Accuracy | Macro F1 | Success | Invalid | Median | P95 | Gate |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Ollama | Controlled | 21 | 95.24% | 95.10% | 100% | 0% | 88 ms | 91 ms | Pass |
| Gemini | Controlled | 21 | 100% | 100% | 100% | 0% | 127 ms | 130 ms | Pass |

Controlled predictions and latencies are scripted fixtures. Their purpose is
to prove that local and cloud provider kinds traverse the same preprocessing,
execution, evaluation, evidence, API, and dashboard contracts.

## Live evidence status

Live Ollama and Gemini adapters are implemented. A live result is recorded only
after the corresponding command contacts a real provider. No live provider
performance is claimed in committed evidence.

See [`provider-execution.md`](provider-execution.md) for the exact commands.

## Acceptance mapping

| Requirement | Evidence |
|---|---|
| Bounded vision workload | `workload-specification.md` |
| Dataset source, license, labels, privacy | `dataset-card.md` and `manifest.json` |
| Typed request/result schemas | `core/schemas.ts` |
| Deterministic metrics | `core/metrics.ts` and VB-011–VB-018 |
| Controlled local/cloud tests | VB-023, VB-024, VB-040, and VB-042 |
| Evidence recording | `evidence/vision-benchmark/*.json` |
| Comparison dashboard | `/vision-benchmark` and API GET |
| 10+ test cases | 48 documented cases |
| Two-minute explanation | `two-minute-explanation.md` |
| Live modification demo | `live-modification-demo.md` |
