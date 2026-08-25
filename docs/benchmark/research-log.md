# Research log — provider layer and benchmark harness

Why each decision was made, what evidence supports it, and where the vendor
documentation says so. The acceptance criterion this file exists to satisfy:
*every recommendation shows evidence and at least one official source, and
every unmeasured claim is marked as an assumption.*

Read with [`docs/benchmark/README.md`](./README.md) (what is in the branch),
[`docs/local-model-setup.md`](../local-model-setup.md) (how to run it) and
[`docs/internal/benchmark-api.md`](../internal/benchmark-api.md) (the wire
contract).

**Conventions in this file.** A claim marked **measured** was observed by a
command in this repository, and the command is named. A claim marked **vendor**
comes from official documentation, and the URL is given. A claim marked
**ASSUMPTION** is neither — it is reasoning, and it is flagged so nobody later
mistakes it for a finding.

---

## 1. Why stream every request, when nothing displays the tokens

**Decision.** All three real adapters use the streaming endpoint even though
the harness discards the token text.

**Reason.** Time-to-first-token cannot be measured from a buffered response. If
the whole body arrives at once, the first byte and the last byte have the same
timestamp, and TTFT would equal total latency — a number that looks like a
measurement and is an artefact.

**Vendor.** Ollama's `/api/generate` returns newline-delimited JSON with
`"stream": true`, one object per token, and a final object with `"done": true`
carrying the counters —
<https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion>.
Gemini exposes `streamGenerateContent` with `alt=sse` —
<https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent>.
Groq follows the OpenAI shape with `stream: true` —
<https://console.groq.com/docs/api-reference#chat-create>.

**Cost of the decision.** Streaming parsers are more code than `await
response.json()`, and each vendor frames its stream differently (NDJSON vs SSE).
That cost is confined to `http.ts` and one `streamOnce` per adapter; the timing,
timeout and classification logic is shared in `BaseProvider` so four adapters
cannot drift apart in *how* they measure.

**Subtlety, and a real bug it caused.** For the OpenAI-shaped providers the
first SSE frame carries `delta.role` with no content. Taking TTFT on the first
frame measures the handshake, not the first token. TTFT is taken on the first
frame that carries actual content. Tests in
`tests/benchmark/groq-provider.test.ts` and `gemini-provider.test.ts` assert
this by feeding a role-only frame first.

---

## 2. Token counts come from the provider, never from the text

**Decision.** `output_tokens` is read from the provider's own counter. When a
provider does not report one, the field is `null` with provenance
`unavailable` — it is never estimated from character count.

**Reason.** A token is whatever that model's tokenizer says it is.
Characters ÷ 4 is a different quantity wearing the same name, and a throughput
figure built on it would be wrong by a model-dependent factor while looking
exactly as authoritative as a real one.

**Vendor.** Ollama reports `eval_count` (tokens) and `eval_duration` in
**nanoseconds** in the `done` object — see the API doc linked above. Gemini
reports `usageMetadata.candidatesTokenCount` —
<https://ai.google.dev/api/generate-content#UsageMetadata>. Groq requires
`stream_options: { include_usage: true }` before it will send a `usage` frame
at all, and reports `x_groq.usage.completion_time` in **seconds** —
<https://console.groq.com/docs/api-reference#chat-create>.

Three vendors, three units: nanoseconds, a plain count, and seconds. Each
conversion happens once, in its own adapter, next to a comment naming the unit.
`nanosecondsToMilliseconds` and the Groq seconds→ms conversion are unit-tested
with the vendor's own example values.

**Throughput denominator.** Where a provider reports its own generation time,
that is preferred over wall-clock, and the field is labelled `derived` rather
than `measured`. Wall-clock includes network transit and queueing;
provider-reported generation time is closer to the thing the number claims to
describe. When neither is available the field is `null`.

---

## 3. Nothing throws across the module boundary

**Decision.** A provider failure is returned as a `MeasuredIteration` with
`success: false`, a documented `error_code`, and a real `latency_ms`. Adapters
never let an exception escape into the runner.

**Reason.** Reliability is successes ÷ total. If a failure throws, the caller
has two bad options: swallow it, which inflates reliability by shrinking the
denominator, or abort the run, which loses the evidence of *how* it failed. A
failed iteration is a measurement — how long a call took to fail is data, and
`evidence/benchmark/failure-modes.json` exists because of it.

**Measured.** `npm run bench:evidence:failures` drives all eight codes through
the real adapters over scripted transport and every fallback decision through
the real runner. It exits non-zero if any classification stops matching the
documented table, so the doc and the code cannot drift silently.

---

## 4. The fallback rule

**Decision.** *Fall back only when the provider failed for a reason another
provider could plausibly not share.* Six codes fall back; `invalid_model` and
`unauthorized` do not.

**Reason.** Falling back after a rejected credential hides a configuration
fault behind a working answer — the operator sees a green run and never learns
their key is dead. Falling back after a bad model name answers a question
nobody asked: the caller wanted `llama3.2:1b` measured, and a number from a
different model on a different provider is not that.

**ASSUMPTION.** That this is the right trade-off is reasoning, not a
measurement. The opposite policy (always fall back, always return *something*)
is defensible for a production serving path, where availability beats
diagnosability. This is a benchmarking tool, where the reverse holds. Anyone
disagreeing should change `isRetryableProviderError` in one place and rerun the
evidence capture.

**Measured.** The chain, its terminal code, and the resulting HTTP status are
covered in `tests/benchmark/benchmark-runner.test.ts` and captured in
`failure-modes.json`.

---

## 5. A 200 with no parseable content is a failure

**Decision.** `BaseProvider.measureOnce` treats a response whose text, output
tokens and TTFT are *all* absent as `invalid_response`, not as a successful
zero-token iteration.

**How it was found.** Not by a test — by reading the output of the
evidence-capture script. A proxy answering 200 with an HTML error page produced
an iteration with `success: true`, empty text, no tokens, and a plausible
latency. It would have been averaged into the results as a fast, successful
call. That is the single most dangerous class of bug in a measurement harness:
a wrong number that looks right.

**Regression test.** `tests/benchmark/groq-provider.test.ts`, the
`invalid_response` case.

---

## 6. Every aggregate is nullable, and percentiles are withheld below 3 samples

**Decision.** `latency_ms_mean` and friends are `number | null`. `latency_ms_p50`
is `null` with fewer than three successful iterations.

**Reason.** With zero successes there is no mean latency, and `0` would read as
"instant" rather than "never answered". With one or two samples a p50 says
nothing that min and max do not already say, while carrying the authority of a
percentile.

**Vendor.** Nearest-rank is the definition used —
<https://en.wikipedia.org/wiki/Percentile#The_nearest-rank_method>. It is
stated explicitly because linear-interpolation percentiles give different
answers on small samples, and a reader comparing this output to another tool's
needs to know which one this is.

---

## 7. Every figure carries a provenance label

**Decision.** Four states: `measured`, `derived`, `unavailable`, `simulated`.

**Reason.** The handbook forbids fabricating results. The weaker version of
that rule is "do not make numbers up"; the version implemented here is "make it
structurally impossible to read a number without knowing where it came from".
A consumer of this API cannot accidentally plot a derived throughput next to a
measured latency and treat them as the same kind of thing.

**Where it bites.** `simulated: true` propagates to the top of the run envelope
if *any* figure came from the demo adapter, and the demo adapter is off unless
`BENCHMARK_ALLOW_DEMO="true"` — a real deployment cannot silently answer with
fake numbers.

---

## 8. Validation before construction

**Decision.** The route parses the body and returns 400 before the DI container
builds a use case.

**Reason.** An invalid request must never reach a model, must never spend
quota, and must not take sixty seconds to be refused. There is a test whose
entire job is to assert `runBenchmarkUseCase` was never called.

**Vendor.** Zod's `safeParse` is used rather than `parse` so the failure is a
value rather than an exception —
<https://zod.dev/?id=safeparse>. `iterations` is capped at 100, which with
`BENCHMARK_TIMEOUT_MS` bounds the worst-case duration of a single request; the
route sets `maxDuration = 300` to match.

---

## 9. Secrets stay server-side

**Decision.** Credentials are read in exactly one module, `config.ts`, which
calls `assertServerSide()` first. Nothing is ever put in a `NEXT_PUBLIC_`
variable.

**Vendor.** Next.js inlines any `NEXT_PUBLIC_`-prefixed variable into the
client bundle at build time —
<https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser>.
That is publication, and no later fix un-publishes it. The handbook
independently lists exposing provider keys as out of scope.

**Implementation note, honestly stated.** The `server-only` package is *not* a
dependency of this repository, so the guard is a runtime `typeof window`
check, not a build-time error. That is weaker: it fires when the code runs in a
browser rather than when someone tries to build it in. Adding `server-only`
would upgrade it, but adding a dependency during integration week is a cost
somebody else pays. **ASSUMPTION:** the runtime guard plus the single-module
read is sufficient for this project's threat model.

**Docker.** Keys are passed to the `app` service at *run* time from `.env`,
never baked into an image layer. `.gitignore` carries `.env*` with a
`!.env.example` exception.

---

## 10. Docker Compose profiles

**Decision.** Postgres unprofiled; Ollama behind `--profile ollama`; the built
app behind `--profile app`; `--profile all` for everything.

**Reason.** `docker compose up -d` and `bash setup-db.sh` must keep doing
exactly what `docs/internal/database.md` already says they do, or the rest of
the team's workflow breaks the day they pull. Everything added is opt-in. The
Ollama image is multi-gigabyte, and a teammate who only needs the database
should not pull it.

**Vendor.** Services with a `profiles` key are not started unless the profile
is requested —
<https://docs.docker.com/compose/how-tos/profiles/>.

**`OLLAMA_KEEP_ALIVE: '30m'`.** Ollama unloads an idle model after five
minutes by default —
<https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-keep-a-model-loaded-in-memory-or-make-it-unload-immediately>.
Without the override, a reload lands in the middle of a benchmark run and is
measured as latency, making one iteration in a set wildly slower for a reason
that has nothing to do with the model's speed.

**GPU commented out by default.** A `deploy.resources.reservations.devices`
block for NVIDIA makes the service fail to start on a machine without one, so
it ships commented with instructions —
<https://docs.docker.com/compose/how-tos/gpu-support/>. **A CPU figure and a
GPU figure are not comparable**; the environment snapshot in every measured
file says `accelerator: NOT DETECTED` precisely so nobody assumes.

---

## 11. Model choice for the default benchmark

**Decision.** `llama3.2:1b` for Ollama, `llama-3.1-8b-instant` for Groq,
`gemini-2.0-flash` for Gemini.

**Reason.** The default must run on a laptop with no GPU, or the "reproducible
setup" criterion fails for most of the team. A 1B model at Q4 is roughly 1.3 GB
on disk (**vendor**: <https://ollama.com/library/llama3.2>) and runs on CPU.

**ASSUMPTION, stated loudly:** these three are *not* an apples-to-apples
comparison. Different parameter counts, different quantisation, different
hardware, different network paths. The harness measures what each provider does
with the prompt it was given; it does not establish that one provider is faster
than another *in general*, and no output of this system claims that.

---

## 12. Injected dependencies everywhere

**Decision.** Every adapter takes `fetchImplementation` and `clock`.

**Reason.** Timeout behaviour, stream-parsing edge cases and error
classification are exactly the paths that must be tested and exactly the paths
a live network cannot be made to produce on demand. With injection, all 122
tests run with no network and no real timers, in about three seconds.

**The clock convention.** `steppedClock(stepMs)` advances on every read, so a
10 ms step yields TTFT of exactly 10 ms and latency of exactly 20 ms —
assertable as integers rather than as ranges. A test that asserts
`latency > 0` passes for a broken implementation; one that asserts
`latency === 20` does not.

---

## 13. es5 target — two things it broke

**Measured, the hard way.**

`extends Error` does not survive downlevelling to es5: the prototype chain is
severed and `instanceof` on a custom Error subclass returns `false` at runtime
(**vendor**:
<https://github.com/microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work>).
`ProviderFailureError` is therefore detected by a branded property,
`PROVIDER_FAILURE_BRAND`, never by `instanceof`.

`for await (const chunk of stream)` is not available either, so the stream
readers use explicit `reader.read()` loops. `AbortSignal.timeout()` is likewise
not assumed — timeouts are `AbortController` plus `setTimeout`, which also
makes them controllable from a test.

**And a third thing, found in this branch.** `tsx` strips types without
checking them, so the evidence-capture script had never been typechecked and
carried two real type errors that runtime happily ignored — an `iteration`
property on an interface that has no such field, and `text: null` where the
type says `string`. `npx tsc --noEmit` now passes clean, and it is a step in
`bench:clean-start`. **Recommendation: typecheck after writing any script, not
just after writing library code.**

---

## 14. What is deliberately not measured

Stated here so it is not mistaken for an oversight.

**Cost.** Not modelled. Provider pricing changes, depends on tier and region,
and would need a token-count × price-table calculation whose inputs would go
stale in the repository. Any cost input to a readiness score is emitted as
`ASSUMPTION: Cost`.

**Output quality.** Nothing here judges whether an answer was good. Doing that
honestly needs a rubric and a scoring model, which is a different work package.
A fast wrong answer scores exactly as well as a fast right one in this harness,
and that limitation travels with every score.

**Hardware fit.** Placeholder 50 until Moe's device profiling lands. Left as a
constructor parameter with a visible default rather than a constant, so
supplying it later does not mean editing the runner.

**Energy, memory and thermal behaviour.** Not captured. A laptop that throttles
after four iterations produces a different p50 than one that does not, and
nothing here detects that. **ASSUMPTION:** runs of five iterations on a cool
machine are not materially throttled. Untested.

---

## Sources

Provider APIs:

- Ollama, generate a completion (NDJSON stream, `eval_count`,
  `eval_duration` in nanoseconds) —
  <https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion>
- Ollama, keeping a model loaded —
  <https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-keep-a-model-loaded-in-memory-or-make-it-unload-immediately>
- Ollama, llama3.2 model card and sizes — <https://ollama.com/library/llama3.2>
- Gemini, `streamGenerateContent` —
  <https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent>
- Gemini, `usageMetadata` —
  <https://ai.google.dev/api/generate-content#UsageMetadata>
- Groq, chat completions, `stream_options.include_usage`, `completion_time` —
  <https://console.groq.com/docs/api-reference#chat-create>

Platform:

- Next.js, environment variables and browser bundling —
  <https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser>
- Docker Compose, profiles — <https://docs.docker.com/compose/how-tos/profiles/>
- Docker Compose, GPU support —
  <https://docs.docker.com/compose/how-tos/gpu-support/>
- TypeScript, extending built-ins under es5 —
  <https://github.com/microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work>
- Zod, `safeParse` — <https://zod.dev/?id=safeparse>

Method:

- Nearest-rank percentile —
  <https://en.wikipedia.org/wiki/Percentile#The_nearest-rank_method>
