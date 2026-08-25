# Benchmark & provider layer — branch guide

**Work package:** *"Build the server-side provider abstraction for Ollama plus
Gemini/Groq, benchmark APIs, timeout/fallback behavior, Docker/WSL setup and
reproducible performance capture. Keep all secrets and execution logic
server-side."*

**Owner:** Adham Yakout — AI / Local Model & DevOps Engineer, Team 15.

Read this first if you are reviewing the PR. Setup instructions live in
[`docs/local-model-setup.md`](../local-model-setup.md); the wire contract lives
in [`docs/internal/benchmark-api.md`](../internal/benchmark-api.md).

---

## The one-paragraph version

Three real provider adapters (Ollama, Gemini, Groq) plus a clearly-labelled
simulator sit behind one port. A registry decides which are usable in this
environment and in what order to try them. A runner turns raw adapter output
into a typed measurement envelope where **every figure carries a provenance
label** and **every aggregate is nullable**, so nothing in the system can report
a number it did not observe. Timeouts, unreachable local runtimes, bad model
names and provider faults all resolve to one of eight documented error codes
with a fixed HTTP status and a fixed retry policy. Secrets are read once,
server-side, and never cross into a response or a client bundle. 122 tests, and
three scripts that regenerate the evidence rather than asserting it.

---

## Getting it running in five minutes

```bash
cp .env.example .env                          # fill in what you have; nothing is mandatory
docker compose --profile ollama up -d
docker compose --profile ollama exec ollama ollama pull llama3.2:1b
npm ci && npx prisma generate
npm run db:deploy && npm run db:seed
npm run dev
curl http://localhost:3000/api/v1/providers   # every adapter + whether it is configured
```

No GPU needed. No API key needed — an unconfigured provider reports itself as
unconfigured and is skipped rather than failing. Full instructions, including
the Windows/WSL2 specifics and the troubleshooting list, are in
[`docs/local-model-setup.md`](../local-model-setup.md).

---

## What is in the branch

**New — the provider layer**

```
src/modules/benchmark/infrastructure/providers/
  BaseProvider.ts       timing, timeout, classification, iteration — shared, so
                        four adapters cannot drift apart in how they measure
  OllamaProvider.ts     NDJSON /api/generate; eval_count + eval_duration (ns)
  GeminiProvider.ts     streamGenerateContent?alt=sse; usageMetadata
  GroqProvider.ts       OpenAI-shaped SSE; stream_options.include_usage
  DemoProvider.ts       simulated, opt-in only, every figure labelled
  ProviderRegistry.ts   what exists, what is usable, in what order to try it
  errors.ts             the eight documented codes + status + retry policy
  http.ts, types.ts     shared transport helpers and the measurement types
  config.ts             env read once, validated, with a server-only guard
```

**New — application layer**

```
src/modules/benchmark/application/services/BenchmarkRunner.ts
src/modules/benchmark/application/dtos/BenchmarkMeasurement.ts
src/modules/benchmark/infrastructure/repositories/Prisma*.ts
src/modules/benchmark/infrastructure/container.ts
```

**New — infrastructure and evidence**

```
Dockerfile, .dockerignore, docker-compose.yml, setup-db.sh
prisma/migrations/, prisma/seed.ts, src/lib/prisma.ts
scripts/benchmark/run-benchmark.ts             measured figures
scripts/benchmark/capture-failure-evidence.ts  failure + fallback behaviour
scripts/benchmark/capture-clean-start.ts       the setup log
tests/benchmark/                               11 suites, 122 tests
docs/local-model-setup.md, docs/internal/benchmark-api.md
docs/benchmark/README.md, docs/benchmark/research-log.md
AI_USAGE.md                                    handbook requirement, one
                                               section per work package
```

**Modified**

| File | Change |
|---|---|
| `src/app/api/v1/benchmarks/route.ts` | filled in; **envelope shape unchanged** — everything new is inside `data` |
| `src/app/api/v1/providers/route.ts` | filled in; existing field names kept, new fields added |
| `src/app/api/v1/readiness/[id]/route.ts` | filled in; splits the `ASSUMPTION:` lines back out of `limitations` |
| `.../use-cases/RunBenchmark.ts` | ownership checks, persistence, graceful degradation when the DB is down |
| `prisma/schema.prisma` | benchmark, result, readiness and provider models |
| `next.config.mjs` | `output: 'standalone'` so the Docker image stays small |
| `.env.example` | the benchmark variables, documented |
| `.gitignore` | `.env*` with a `!.env.example` exception, and `!/evidence/benchmark/*.log` so the blanket `*.log` rule stops swallowing the clean-start capture |
| `package.json` | three `bench:*` scripts |
| `docs/internal/README.md` | index rows for the four new documents |
| `README.md` | one section pointing at this guide, matching the vision module's existing section |

---

## The five decisions worth arguing about

**1. Nothing throws across the module boundary.** A failed iteration is still a
measurement. Reliability is successes ÷ total, so swallowing a failure would
inflate it and returning early would lose the evidence of *how* it failed.

**2. Fall back only when the provider failed for a reason another provider
could plausibly not share.** `timeout`, `local_unavailable`, `rate_limited`,
`invalid_response`, `not_configured` and `provider_error` fall back.
`invalid_model` and `unauthorized` do **not** — falling back after a rejected
key hides a configuration fault behind a working answer, and falling back after
a bad model name answers a question nobody asked.

**3. Never fabricate a number.** Every summary aggregate is nullable.
Percentiles are withheld below three samples. Every field carries a status of
`measured | derived | unavailable | simulated`. Cost and output quality are not
measured at all and are labelled `ASSUMPTION:` wherever they feed a score.

**4. Validation happens before anything is constructed.** The route parses the
body and returns 400 before the container builds a use case, so an invalid
request costs no quota and never reaches a model. There is a test whose entire
job is to assert `runBenchmarkUseCase` was never called.

**5. A 200 with no parseable content is a failure, not a zero.** Found by the
evidence-capture script, not by a test: a proxy answering 200 with an HTML error
page produced a "successful" iteration with empty text, no tokens and a
real-looking latency. It now returns `invalid_response`. The regression test is
in `tests/benchmark/groq-provider.test.ts`.

---

## Error codes

| Code | HTTP | Falls back? |
|---|---|---|
| `timeout` | 504 | yes |
| `local_unavailable` | 503 | yes |
| `invalid_model` | **422** | **no** |
| `unauthorized` | 502 | **no** |
| `rate_limited` | 429 | yes |
| `invalid_response` | 502 | yes |
| `not_configured` | 503 | yes |
| `provider_error` | 502 | yes |

Explanations and remedies: [`docs/local-model-setup.md`](../local-model-setup.md#documented-error-behaviour).
The generated proof that the code still behaves this way:
`evidence/benchmark/failure-modes.json`.

---

## Security posture

- API keys are read **only** in `config.ts`, which runs an `assertServerSide()`
  guard and throws if it is ever reached from a browser bundle. (`server-only`
  is not a dependency of this repo, so the guard is a runtime `typeof window`
  check rather than a build-time one.)
- No key, and no fragment of a key, appears in any API response. There is a test
  that asserts an internal host string never reaches the 500 body.
- `NEXT_PUBLIC_` is never used for anything secret. The handbook lists exposing
  provider keys as explicitly out of scope, and a `NEXT_PUBLIC_` variable is
  inlined into the client bundle at build time — publishing it permanently.
- `.gitignore` carries `.env*` with a `!.env.example` exception. Docker Compose
  passes secrets in at **run** time; they are never baked into an image.
- The Postgres credentials in `docker-compose.yml` are deliberately non-secret:
  that database holds local test data and is not reachable from outside the
  machine.

---

## Evidence

| File | What it is | How to regenerate |
|---|---|---|
| `evidence/benchmark/failure-modes.json` | Every documented error code driven through the real adapters, and every fallback decision through the real runner. Each record carries `behaved_as_documented`. | `npm run bench:evidence:failures` |
| `evidence/benchmark/clean-start.log` | Every command of the documented setup sequence with its real exit code and output. | `npm run bench:clean-start` |
| `evidence/benchmark/measured-*.json` | Latency, TTFT and throughput actually observed, with a machine snapshot. | `npm run bench:run -- --provider=ollama` |

Each artefact carries explicit `what_this_proves` and `what_this_does_not_prove`
fields. The failure-mode timings are harness artefacts, not measurements —
`measured-*.json` is the only file in the repository containing real performance
figures.

> **Before you push:** the committed `clean-start.log` was captured in a Linux
> container with `--skip-docker`, so the Docker steps are marked skipped, and
> two optional steps failed there for reasons that do not apply on a real
> machine — `prisma generate` (blocked binary download) and `npm run build`
> (which needs that client, plus Google Fonts). Re-run
> `npm run bench:clean-start` on your own machine with Docker running to
> overwrite it with a real Windows/WSL2 capture in which all fourteen steps
> pass, and run
> `npm run bench:run -- --provider=ollama --model=llama3.2:1b --iterations=5`
> to produce the first measured file. Neither can be captured anywhere but on
> the machine whose numbers you are reporting.
>
> One honest caveat to record with it: state whether that run used a GPU. The
> environment snapshot writes `accelerator: NOT DETECTED` on purpose, because a
> CPU figure and a GPU figure are not comparable and nothing in the harness can
> tell them apart.

---

## Validation status

Everything below was run in this branch, in this order. Commands, not claims.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, clean |
| Lint | `npm run lint` | **0 errors.** 8 warnings, all in files this branch does not touch — `eslint.config.mjs`, `devices/route.ts`, `workloads/route.ts`, `ReadinessCalculator.ts`. This work package adds zero new warnings. |
| Benchmark suite | `npx jest tests/benchmark --ci` | 11 suites, **122 tests**, all pass |
| Whole repository | `npm test` | 16 suites, **170 tests**, all pass — the vision module included, so nothing of Isa's was broken |
| Failure evidence | `npm run bench:evidence:failures` | regenerates cleanly; exits non-zero if any classification drifts |
| Clean start | `npm run bench:clean-start -- --skip-docker` | PASS — every required step succeeded |
| Production build | `npm run build` | **Compiles and typechecks** (`✓ Compiled successfully`, `Finished TypeScript`). Does not complete in this container — see below. |

The build stops at page-data collection with `@prisma/client did not initialize
yet`, because `npx prisma generate` cannot reach `binaries.prisma.sh` from the
container this was prepared in (403). Separately, `next/font` in
`src/app/layout.tsx` cannot fetch Inter from Google Fonts there. Neither is a
code fault and neither is in this work package — **run `npx prisma generate`
and then `npm run build` on your own machine to close both**, and the
compile-and-typecheck phases passing is what proves the TypeScript in this
branch is production-clean.

The typecheck deserves one line of its own: `tsx` strips types without checking
them, so the evidence scripts had never been typechecked at all. The first
`tsc --noEmit` over this work found nine real errors that runtime had happily
ignored. It is now step 11 of `bench:clean-start`.

---

## Tests

```bash
npx jest tests/benchmark          # 11 suites, 122 tests — use this while iterating
npm test                          # everything, incl. another member's vision module
```

Coverage by category, as the acceptance criteria require:

- **normal** — TTFT taken on the first *content* chunk not the role chunk;
  provider-reported generation time preferred as the throughput denominator;
  usage read from both the top-level and the vendor-specific field.
- **invalid** — non-JSON body; provider outside the enum; `iterations: 5000`;
  non-uuid ids; unknown model → 422; rejected credential → no fallback.
- **timeout** — every adapter times out without throwing, reports `timeout`,
  and still records the elapsed time.
- **fallback** — retryable codes advance the chain, non-retryable codes end it,
  partial success is accepted, and a fully failed run returns the chain so it
  can be diagnosed.
- **plus** ownership (403 across owners), persistence failure at three separate
  points (the run still returns, `persisted: false`), and a run where every
  provider failed (no score is invented).

Two notes for whoever runs this:

- `npm test` has a `pretest` hook that regenerates the vision fixtures and
  dirties `evidence/vision-benchmark/`. Run `git checkout -- evidence/vision-benchmark`
  before committing.
- A bare `npx jest` (no `pretest`) fails two vision tests on a missing fixture.
  Not a regression, not this module. `npm run vision:fixtures` first, or use the
  scoped command above.

---

## For Ahmed at integration time

Merge conflicts are yours, not mine — but here is what you need to know to
resolve them well.

**Contracts I did not change.** The `{ success, data }` / `{ success, error }`
envelope is untouched, and every field name the scaffold already had on
`/api/v1/providers` still exists with the same meaning. Everything I added is
additive. If a conflict forces a choice, keep the existing field names.

**Interfaces other people own.** `AIProvider` and `BenchmarkRepository` are
implemented, not modified. The error code rides *inside* the existing
`error_message` string as `"<code>: <message>"` precisely so I did not have to
widen a port someone else depends on — `decodeFailure()` reads it back.

**Things I deliberately left as parameters, not constants.**
`UnmeasuredReadinessInputs` (`hardwareFit`, `estimatedCostPer1kRequests`) are
arguments to the runner with visible defaults, so when Moe's device profiling
and a cost model land they can be supplied without touching the runner.

**Docker Compose.** Postgres is unprofiled, so `docker compose up -d` and
`bash setup-db.sh` still do exactly what `docs/internal/database.md` says.
Everything I added is behind `--profile ollama`, `--profile app` or
`--profile all`, so nobody's existing workflow changes when they pull.

**Size.** This is well over the 400-line PR guidance in `team-workflow.md`. It
splits cleanly along a seam if you want two PRs: (a) database — `prisma/`,
`src/lib/`, `setup-db.sh`, `docs/internal/database.md`; (b) provider layer —
everything else. They are independent; (b) degrades gracefully with no database
at all.

**What is genuinely not done.** Listed below, honestly, rather than left for you
to discover.

---

## Known gaps

- **No authenticated session.** `RunBenchmark` takes an owner id from the
  workload row and says so in the response. `GET /api/v1/benchmarks` refuses to
  list without an explicit `?user_id=`, because returning every row would expose
  other people's runs. Wire it to NextAuth when the session exists.
- **Cost is not modelled.** Any cost input to a readiness score is
  `ASSUMPTION: Cost`.
- **Hardware fit is a placeholder** (50) until the device profile lands.
- **Output quality is not measured** anywhere. Nothing here judges whether an
  answer was good.
- **No live measured figures are committed yet** — see the push note above.
  Every mechanism that captures them is tested; the numbers themselves have to
  come off a real machine.
- **Vision benchmark is a separate module** (Isa's). I did not touch it.
