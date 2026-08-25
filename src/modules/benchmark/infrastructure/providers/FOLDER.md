# `src/modules/benchmark/infrastructure/providers/` - the adapters

**Work package:** benchmark and provider layer.

## What this folder is

Nine files: one base class, four provider adapters, a registry, the error
vocabulary, and two transport helpers.

The shape is deliberate. A subclass implements exactly one thing - how to
stream one generation out of one provider (`streamOnce`). Timing, timeout
enforcement, error classification, iteration and narrowing to the shared result
type all happen in the base class, so **the four adapters cannot drift apart in
how they measure or how they fail**.

## What happened here

Unchanged in this pass, which is worth noting given how much moved around them.
The adapters were already correct; what changed was what the layers above them
were allowed to conclude from their output.

Two properties they already had are what made the rest possible. Every adapter
takes its `fetch` and its clock by **injection**, so the whole suite runs with
no network and no real timers. And **nothing here throws across the module
boundary**: a failed iteration is still a measurement, and the reliability score
is computed from how many iterations succeeded - so swallowing a failure would
inflate it.

## Files

| File | What it is |
|---|---|
| `BaseProvider.ts` | 328 lines. Timing, timeouts, error classification, iteration. `ProviderFailureError` and its brand |
| `OllamaProvider.ts` | 167 lines. The local adapter. `POST /api/generate` with `stream: true` returns newline-delimited JSON, one object per token, with durations in **nanoseconds**. It streams even though the tokens are never displayed, because time-to-first-token cannot be measured from a buffered response - with `stream: false` the first byte and the last byte arrive together |
| `GroqProvider.ts` | 176 lines. OpenAI-compatible SSE. Usage is omitted from streamed chunks unless `stream_options: { include_usage: true }` is sent. Groq also reports `x_groq.usage.completion_time` in **seconds** - server-side generation time excluding queueing, a better throughput denominator than our wall clock |
| `GeminiProvider.ts` | 182 lines. `:streamGenerateContent` with `alt=sse`. `usageMetadata` repeats across chunks, so the last one wins. The key travels in the `x-goog-api-key` **header, never the query string** - a URL lands in server logs and proxy logs; a header does not |
| `DemoProvider.ts` | 134 lines. The documented substitute the acceptance criteria allow when no real provider is reachable. **It produces no measurements**: every figure is labelled `simulated`, it is never registered unless `BENCHMARK_ALLOW_DEMO=true`, and the runner marks any run that touched it. Deterministic on purpose, so a demo is reproducible |
| `ProviderRegistry.ts` | 152 lines. Which adapters exist, which are usable here, in what order to try them. Built from a `BenchmarkConfig` rather than reading `process.env` itself, so a test can construct any environment without mutating global state |
| `errors.ts` | 199 lines. The published failure vocabulary. Every provider failure is mapped to one of these codes before it leaves an adapter. `docs/local-model-setup.md` lists them and the API returns their statuses |
| `http.ts` | 151 lines. SSE and line-delimited stream readers, `tokensPerSecond`, the injected clock. A deliberate copy of the vision module's equivalent rather than a shared import, so the two modules can change independently |
| `types.ts` | 129 lines. The measurement vocabulary: `MeasurementProvenance`, `MeasurementStatus`, `ProviderUsage`. Every number that leaves this module carries a label saying how it was obtained |

## Connected folders

- [`../../core/ports/`](../../core/ports/FOLDER.md) - the `AIProvider` interface.
- [`../`](../FOLDER.md) - `config.ts` builds the registry.
- [`src/app/api/v1/providers/`](../../../../app/api/v1/providers/FOLDER.md) - the
  catalogue endpoint.
- [`tests/benchmark/`](../../../../../tests/benchmark/FOLDER.md) - one suite per
  adapter, plus `provider-errors` and `provider-registry`.
- [`docs/benchmark/`](../../../../../docs/benchmark/FOLDER.md) - the research log
  cites the official streaming contracts for all three.

<p align="right"><sub><i>Adham Yakout</i></sub></p>
