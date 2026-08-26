# `tests/benchmark/` - the measurement core under test

**Work package:** benchmark and provider layer.

## What this folder is

Nineteen files covering the provider adapters, the runner, the use cases, the
core services and the API route.

## What happened here

Seven files are new, all of them covering services that did not exist before:
hardware fit, task compatibility, privacy assessment, comparison planning,
comparison runs, the Ollama catalogue and the egress warning.

`run-benchmark.test.ts` changed most among the existing files (73 lines
differing) - it uses the **real** `BenchmarkRunner` over scripted providers
rather than a stubbed runner, so the envelope that comes out is the one the API
actually returns, and the cold-start change moved through it.

One fix in here is worth calling out because of how it was made rather than
what it was: a run of three iterations was reporting "4/4 iterations
succeeded", because the success chain was counting the discarded warm-up. The
fix went into the runner, not into the assertion.

## Files

| File | What it covers |
|---|---|
| `helpers.ts` | The test doubles: fake providers, a stepped clock, a frozen clock, SSE and NDJSON response builders, connection-refused and hanging `fetch` stubs |
| `benchmark-runner.test.ts` | When the runner falls back. The rule: fall back only when the provider failed for a reason another provider could plausibly not share |
| `run-benchmark.test.ts` | The use case - ownership refusals, persistence failure mid-run, and the full envelope |
| `benchmarks-route.test.ts` | Parse, dispatch, status code. Above all: refuse a malformed body **before** anything constructs a provider, because a provider call costs money, quota and up to five minutes |
| `benchmark-measurement.test.ts` | What the summary refuses to report. This is where a number would be invented if anywhere |
| `benchmark-config.test.ts` | Environment validation and the server-side guard |
| `hardware-fit.test.ts` | VRAM residency, spill share, and the states between |
| `task-compatibility.test.ts` | The asymmetric rule - vision can do text, text cannot do vision, embedding neither |
| `privacy-assessor.test.ts` | Privacy class, disqualifiers, egress classification |
| `egress-warning.test.ts` | The pre-flight warning, including that it does **not** carry the prompt text |
| `comparison.test.ts` | Planning and reporting: overlapping ranges must not produce a winner |
| `run-comparison.test.ts` | The comparison use case, including sequential execution for local entrants |
| `visitor-keys.test.ts` | Header parsing for a visitor's own cloud keys: trimmed, shape-checked, laid over the server's per provider |
| `recorded-provider.test.ts` | A browser-recorded run through the runner: cold start discarded, browser residency readings used, no cloud fallback; and the request schema's recording rules |
| `ollama-catalog.test.ts` | Runtime status and the installed-model list |
| `cloud-catalog.test.ts` | Gemini and Groq model lists: filtering, pagination, key-in-header, and each failure message |
| `ollama-provider.test.ts` | NDJSON streaming, nanosecond conversion, TTFT |
| `gemini-provider.test.ts` | SSE parsing, `usageMetadata`, header-carried key |
| `groq-provider.test.ts` | OpenAI-compatible SSE, `stream_options.include_usage`, `completion_time` in seconds |
| `demo-provider.test.ts` | The one promise that makes the demo adapter acceptable: nothing it produces can be mistaken for a measurement |
| `provider-errors.test.ts` | The published error vocabulary. This is what stops the code and `docs/local-model-setup.md` drifting apart |
| `provider-registry.test.ts` | Which adapters are usable in a given environment, and in what order |

## Connected folders

- [`src/modules/benchmark/`](../../src/modules/benchmark/FOLDER.md) - the module
  under test.
- [`src/app/api/v1/benchmarks/`](../../src/app/api/v1/benchmarks/FOLDER.md) -
  the route `benchmarks-route.test.ts` drives with the container mocked.
- [`docs/local-model-setup.md`](../../docs/FOLDER.md) - the error-code table
  `provider-errors.test.ts` pins.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/app/api/v1/`](../../src/app/api/v1/FOLDER.md)
- [`src/app/api/v1/comparisons/`](../../src/app/api/v1/comparisons/FOLDER.md)
- [`src/app/api/v1/local-runtime/`](../../src/app/api/v1/local-runtime/FOLDER.md)
- [`src/modules/benchmark/application/`](../../src/modules/benchmark/application/FOLDER.md)
- [`src/modules/benchmark/application/dtos/`](../../src/modules/benchmark/application/dtos/FOLDER.md)
- [`src/modules/benchmark/application/services/`](../../src/modules/benchmark/application/services/FOLDER.md)
- [`src/modules/benchmark/application/use-cases/`](../../src/modules/benchmark/application/use-cases/FOLDER.md)
- [`src/modules/benchmark/core/`](../../src/modules/benchmark/core/FOLDER.md)
- [`src/modules/benchmark/core/ports/`](../../src/modules/benchmark/core/ports/FOLDER.md)
- [`src/modules/benchmark/core/services/`](../../src/modules/benchmark/core/services/FOLDER.md)
- [`src/modules/benchmark/infrastructure/`](../../src/modules/benchmark/infrastructure/FOLDER.md)
- [`src/modules/benchmark/infrastructure/providers/`](../../src/modules/benchmark/infrastructure/providers/FOLDER.md)
- [`tests/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
