# Benchmark API — wire contract

Every endpoint the benchmark and provider layer exposes, with the exact shapes
that go in and come out, and every status it can return.

Owner: Adham Yakout (AI / Local Model & DevOps). Setup:
[`docs/local-model-setup.md`](../local-model-setup.md). Branch overview:
[`docs/benchmark/README.md`](../benchmark/README.md).

Base path `/api/v1`. All four routes are `dynamic = 'force-dynamic'` — a
benchmark performs real inference and must never be statically evaluated at
build time or served from a cache.

---

## The envelope

Unchanged from the scaffold, because the dashboard is written against it.

```jsonc
{ "success": true,  "data": { } }            // and sometimes "meta" or "message"
{ "success": false, "error": "…", "details": … }
```

`error` is a short human-readable label. `details` is either a string or the
raw Zod issue array, depending on where the failure happened. One case carries
both `success: false` **and** `data`: a run in which every provider failed
(see [POST /benchmarks](#post-apiv1benchmarks)) — the body is a failure, but the
run inside it is real evidence and is returned rather than discarded.

---

## POST /api/v1/benchmarks

Runs a benchmark and records it.

### Request

```jsonc
{
  "workload_id": "uuid",     // required
  "device_id":   "uuid",     // required
  "provider":    "ollama",   // "ollama" | "gemini" | "groq"
  "model":       "llama3.2:1b",
  "prompt":      "…",        // 1–10000 characters
  "iterations":  5           // integer, 1–100
}
```

Validated by `BenchmarkRequestSchema` **before the DI container builds a use
case**, so a malformed request never reaches a provider and never costs a
token. `demo` is deliberately absent from the enum: the simulated adapter is
reachable from the scripts and from the fallback chain when
`BENCHMARK_ALLOW_DEMO="true"`, but it is not something an HTTP caller can ask
for by name.

`iterations` is capped at 100 because the cap and the per-iteration timeout
together bound the request: 100 × `BENCHMARK_TIMEOUT_MS`. `maxDuration = 300`
is set on the route accordingly.

### Success — 200

`data` is a `BenchmarkRun` (`application/dtos/BenchmarkMeasurement.ts`):

```jsonc
{
  "benchmark_id": "uuid | not-persisted",
  "status": "completed",                    // pending | running | completed | failed
  "requested_provider": "ollama",
  "effective_provider": "groq",             // null when everything failed
  "model": "llama3.2:1b",
  "fallback_used": true,
  "fallback_chain": [
    { "provider": "ollama", "outcome": "failed",    "error_code": "local_unavailable", "detail": "…" },
    { "provider": "groq",   "outcome": "succeeded", "error_code": null,                "detail": "…" }
  ],
  "simulated": false,                       // true if ANY figure came from the demo adapter
  "results": [ /* one MeasuredIteration per iteration, below */ ],
  "summary": { /* aggregates, every one nullable, below */ },
  "readiness_score": 72,                    // null when nothing was measured
  "recommendation": "…",
  "evidence": ["…"],                        // what was actually observed
  "assumptions": ["Cost …", "Hardware fit …"],
  "limitations": ["…"],
  "persisted": true,                        // false = measured but not written to the DB
  "started_at": "ISO-8601",
  "completed_at": "ISO-8601"
}
```

**One iteration.** `latency_ms` is present even on failure — how long a call
took to fail is evidence, and a failed iteration still counts against
reliability.

```jsonc
{
  "iteration": 1,
  "provider": "ollama",
  "model": "llama3.2:1b",
  "latency_ms": 812.44,
  "ttft_ms": 91.2,               // null if the provider does not stream usage
  "tokens_per_second": 47.9,     // null if output tokens were not reported
  "output_tokens": 128,
  "input_tokens": 24,
  "success": true,
  "error_code": null,            // one of the eight codes below
  "error_message": null,
  "provenance": {
    "latency_ms": "measured",
    "ttft_ms": "measured",
    "tokens_per_second": "derived",
    "output_tokens": "measured"
  }
}
```

`provenance` is the point of the whole envelope. Each field is
`measured` (a stopwatch reading or a provider-reported count),
`derived` (arithmetic over measured values), `unavailable` (the provider did
not report it — the value is `null`, never zero), or `simulated` (from the demo
adapter; `simulated: true` at the top level too).

**The summary.** Every aggregate is nullable. With zero successful iterations
there is no mean latency, and reporting `0` for "we never got an answer" would
be the most misleading number this system could produce.

```jsonc
{
  "iterations_requested": 5,
  "iterations_run": 5,
  "iterations_succeeded": 4,
  "success_rate_percent": 80,
  "latency_ms_mean": 812.44, "latency_ms_min": 640.1, "latency_ms_max": 1204.8,
  "latency_ms_p50": 790.2,          // nearest-rank; null below 3 successes
  "ttft_ms_mean": 91.2,
  "tokens_per_second_mean": 47.9,
  "output_tokens_total": 512
}
```

`latency_ms_p50` is withheld below three samples because with one or two
successes a percentile says nothing that min and max do not already say.

### Failures

| Status | `error` | When |
|---|---|---|
| 400 | `Validation error` | Body is not valid JSON, or fails `BenchmarkRequestSchema`. `details` carries the Zod issues. |
| 403 | `Cross-owner request` | The workload and the device belong to different users. |
| 404 | `Workload not found` / `Device not found` / `Provider not found` | The referenced row does not exist. Provider means the **catalog** row — run `npm run db:seed`. |
| 503 | `Database unavailable` | The workload/device/provider lookup itself failed. Nothing was measured. |
| 4xx/5xx | `All providers failed` | Every provider in the chain failed. **`data` still contains the full run.** The status is `providerErrorStatus(<last attempt's code>)`, or 502 if the chain reported no code. |
| 500 | `Internal server error` | Unexpected. The message is logged server-side and deliberately not returned. |

Three of these are worth their reasoning:

**403, not 404.** Ownership is derived from `workloads.user_id` until session
handling lands. Attributing a run to the wrong user is worse than refusing it,
so a mismatched device/workload pair is refused rather than guessed at.

**Every provider failed is not a 500.** The fallback chain is what an operator
needs in order to diagnose the failure, so it is returned. The status comes
from the *last* attempt's code — a chain ending in `timeout` answers 504, one
ending in `unauthorized` answers 502.

**`persisted: false` is a 200.** The measurement is the expensive part and it
already happened by the time the write is attempted. A database fault after a
successful run returns the run with `persisted: false` and a limitation saying
so, rather than a 500 that throws away real evidence.

---

## GET /api/v1/benchmarks

Reads recorded benchmarks. Query parameters, both optional, both uuid:

| Query | Behaviour |
|---|---|
| `?benchmark_id=<uuid>` | `data: { benchmark, results, readiness }`. 404 if unknown. |
| `?user_id=<uuid>` | `data: [ benchmark, … ]` for that owner. |
| *(neither)* | `200` with `data: []` and a `message` explaining why. |

The empty-list case is deliberate. Without a session there is no "current
user", and returning every row would expose other people's runs, so an explicit
owner is required. Returning `[]` rather than a 400 keeps the scaffold's shape
for any caller not yet updated. A malformed (non-uuid) parameter is a 400.

---

## GET /api/v1/providers

The provider catalog plus whether each adapter is usable on this server right
now. No credential, and no fragment of one, appears in this response — there is
a test that asserts an internal host string never reaches the body.

```jsonc
{
  "success": true,
  "data": [{
    // Scaffold fields — names unchanged, the dashboard reads these.
    "provider_id": "uuid | null",
    "name": "ollama",
    "type": "local",
    "base_url": "http://localhost:11434",
    "is_active": true,

    // Added by this work package.
    "display_name": "Ollama (local)",
    "is_configured": true,
    "configuration_hint": "…",       // why it is not configured, when it is not
    "privacy_level": "local",
    "reports_ttft": true,
    "reports_output_tokens": true,
    "official_source": "https://…",
    "in_catalog": true               // false = registry knows it, DB does not
  }],
  "meta": {
    "database_available": true,
    "configuration_warnings": ["…"],  // e.g. an unparseable BENCHMARK_TIMEOUT_MS
    "message": "…"                    // present only when the DB is unreachable
  }
}
```

The endpoint answers even with no database: `provider_id` becomes `null`,
`database_available` becomes `false`, and `meta.message` says to run
`npm run db:seed`. The dashboard can still render the list and say which
providers are configured, which is the question this endpoint mostly exists to
answer.

`configuration_warnings` surfaces environment problems that were *tolerated* —
a `BENCHMARK_TIMEOUT_MS` that could not be parsed, a `BENCHMARK_FALLBACK_ORDER`
naming an unknown provider. The layer falls back to its documented default
rather than refusing to start, but it says so here rather than silently.

---

## GET /api/v1/readiness/[id]

`[id]` is the **benchmark** id, not the readiness-score id: `readiness_scores`
has a unique `benchmark_id`, and the caller holds a benchmark id.

```jsonc
{
  "success": true,
  "data": {
    "hardwareFit": 50, "latencyScore": 81, "privacyScore": 100,
    "costScore": 60,   "reliabilityScore": 80, "overallReadiness": 72,
    "recommendation": "…",
    "evidence": ["…"],
    "limitations": ["…"],      // ASSUMPTION:-prefixed entries removed
    "assumptions": ["…"]       // …and split out to here, prefix stripped
  }
}
```

400 if `[id]` is not a uuid; 404 (with `data: null`) if no score has been
recorded for that benchmark.

The split is the whole reason this route does anything beyond a lookup.
Assumptions are stored *inside* the `limitations` column tagged
`ASSUMPTION: …`, so that a score read out of the database months later still
carries the unmeasured inputs it was computed under. The route separates them
again so a client does not have to know about the prefix — and so that a score
cannot be displayed without its caveats.

---

## Error codes

Every provider failure is mapped onto one of eight codes before it leaves an
adapter. Nothing throws across the module boundary.

| Code | HTTP | Falls back? | Meaning |
|---|---|---|---|
| `timeout` | 504 | yes | Exceeded `BENCHMARK_TIMEOUT_MS`; aborted, no partial result recorded as measured. |
| `local_unavailable` | 503 | yes | Nothing listening on `OLLAMA_HOST`. |
| `invalid_model` | **422** | **no** | Model name not available there. A request error — another provider would not make the name correct. |
| `unauthorized` | 502 | **no** | Credential rejected. Falling back would hide a configuration fault behind a working answer. |
| `rate_limited` | 429 | yes | Rate limit or quota. |
| `invalid_response` | 502 | yes | Answered, but the payload failed schema validation. A provider fault, not a measurement. |
| `not_configured` | 503 | yes | No credential or host in this environment; never called. |
| `provider_error` | 502 | yes | Anything else the provider reported. |

The rule in one sentence: **fall back only when the provider failed for a
reason another provider could plausibly not share.**

Source of truth: `infrastructure/providers/errors.ts`. Generated proof that the
code still behaves this way: `evidence/benchmark/failure-modes.json`, rebuilt by
`npm run bench:evidence:failures`.

### How the code travels

The shared `AIProvider` port exposes a single `error_message: string | null`,
and that port is not mine to widen. So the code rides inside it:

```
encodeFailure({ code, message })  →  "timeout: Request aborted after timeout."
decodeFailure("timeout: …")       →  { code: "timeout", message: "…" }
```

`decodeFailure` degrades to `provider_error` for any string it does not
recognise, so a message written by someone else's code is never mistaken for a
documented code. On a `MeasuredIteration` the code is also surfaced properly as
`error_code`, so no HTTP caller has to parse a string.

---

## Not in this contract

No authentication. Every route is currently open; ownership is derived from
`workloads.user_id` and every response says so in `limitations`. Wiring these
to a session belongs to the integration work package — the change is confined
to where `userId` comes from in `RunBenchmark`.

No cost figures, and no output-quality figures. Neither is measured anywhere in
this layer; both are reported as `ASSUMPTION:` lines wherever they feed a score.
