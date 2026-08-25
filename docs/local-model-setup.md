# Local model & provider setup

Everything you need to go from a clean machine to a measured benchmark.

Written to be followed literally. `scripts/benchmark/capture-clean-start.ts` runs
the same commands in the same order and writes the result to
`evidence/benchmark/clean-start.log` — if this page and that script ever
disagree, the script is right and this page is stale.

Owner: Adham Yakout (AI / Local Model & DevOps).

---

## What you need before you start

| Thing | Version | Why |
|---|---|---|
| Node.js | 20.9 or newer | Next.js 16 requires it. `node --version` |
| npm | 10 or newer | ships with Node 20 |
| Docker Desktop | current | runs Postgres and Ollama |
| WSL2 | enabled | Docker Desktop's backend on Windows |
| Git | any | — |

On **Windows**, Docker Desktop must be using the WSL2 backend, not Hyper-V:
Settings → General → *Use the WSL 2 based engine*. Without it the Ollama
container starts but gets no meaningful CPU share, and every latency figure you
capture is measuring the virtualisation layer.

You do **not** need a GPU. Everything below works on CPU. A CPU figure and a GPU
figure are not comparable, so whichever you use, say which one it was next to
any number you report.

---

## Clone and configure

```bash
git clone https://github.com/Ahmed-Sleem/edgepilot-ai.git
cd edgepilot-ai
cp .env.example .env
```

Open `.env` and fill in what you have. **Nothing is mandatory to get started** —
a provider with no credential reports itself as not configured and is skipped,
which is the honest outcome rather than a crash.

```dotenv
OLLAMA_HOST="http://localhost:11434"
GEMINI_API_KEY="..."     # optional — https://aistudio.google.com/apikey
GROQ_API_KEY="..."       # optional — https://console.groq.com/keys
BENCHMARK_TIMEOUT_MS="60000"
BENCHMARK_FALLBACK_ORDER="ollama,groq,gemini"
BENCHMARK_ALLOW_DEMO="false"
```

Three rules about this file, none of them negotiable:

1. **`.env`, not `.env.local`.** The Prisma CLI reads `.env` only.
2. **Never prefix a key with `NEXT_PUBLIC_`.** That prefix inlines the value
   into the browser bundle at build time, which publishes it. There is no way
   to un-publish it afterwards; the key has to be rotated.
3. **`.env` is gitignored and stays that way.** Run `git status` before every
   commit and confirm it is not listed.

---

## Start the stack

Postgres is not behind a profile, so the plain command still does what
`docs/internal/database.md` says it does. The model runtime is opt-in, because
it is a multi-gigabyte image and a machine that only needs the database should
not pull it.

```bash
docker compose up -d                    # Postgres only
docker compose --profile ollama up -d   # + the local model runtime
docker compose --profile app up -d      # + the built application image
docker compose --profile all up -d      # everything
```

Check it came up:

```bash
docker compose --profile ollama ps
curl http://localhost:11434/api/tags
```

The container reports healthy slightly before the HTTP server accepts requests.
If you benchmark in that window you record a connection refusal as a
measurement, so wait for `/api/tags` to answer rather than for `ps` to look
right.

### Pull a model

```bash
docker compose --profile ollama exec ollama ollama pull llama3.2:1b
docker compose --profile ollama exec ollama ollama list
```

`llama3.2:1b` is the default across the scripts because it fits comfortably on a
CPU-only laptop. Anything Ollama serves works — pass `--model=` to override.

A tag is not a version. `ollama list` prints a digest; that digest is the
reproducible identifier for anything you report.

Models live in the `edgepilot_ollama` named volume, so they survive
`docker compose down` and are downloaded once rather than once per restart.
`docker compose down -v` deletes them.

### GPU (optional)

`docker-compose.yml` has a commented NVIDIA `deploy:` block. Uncomment it only
if you have an NVIDIA GPU **and** the container toolkit (on Windows: a current
driver plus WSL2). A GPU reservation on a machine without one makes the service
fail to start.

---

## Install and set up the app

```bash
npm ci                  # exactly what package-lock.json pins
npx prisma generate
npm run db:deploy       # applies migrations
npm run db:seed         # seeds the provider catalog — needed for provider_id
npm run dev
```

`npm ci`, not `npm install`: it installs the locked versions and fails loudly if
the lockfile and `package.json` disagree, which is the whole point of a clean
start.

Against the **shared Neon database**, only ever run `npm run db:neon:deploy`.
Never `prisma migrate dev` — it can offer to reset, and that wipes everyone's
data.

---

## Verify it works

```bash
curl http://localhost:3000/api/v1/providers
```

Every adapter is listed with `is_configured` and, when false, a
`configuration_hint` naming what is missing. No credential or fragment of one
appears in that response.

Then run one benchmark end to end:

```bash
curl -X POST http://localhost:3000/api/v1/benchmarks \
  -H 'Content-Type: application/json' \
  -d '{
    "workload_id": "<uuid from the seed>",
    "device_id":   "<uuid from the seed>",
    "provider":    "ollama",
    "model":       "llama3.2:1b",
    "prompt":      "Explain edge AI inference in three sentences.",
    "iterations":  3
  }'
```

The full request and response contract is in
[`docs/internal/benchmark-api.md`](./internal/benchmark-api.md).

---

## The scripts

| Command | What it does | Writes |
|---|---|---|
| `npm run bench:run` | Real inference against a real provider. **The only source of measured numbers.** | `evidence/benchmark/measured-<provider>-<model>.json` |
| `npm run bench:evidence:failures` | Drives every documented error code and every fallback decision through the real adapters and the real runner over scripted transport. Exits non-zero if any classification stopped matching the table below. | `evidence/benchmark/failure-modes.json` |
| `npm run bench:clean-start` | Runs this page's sequence and records every command, exit code and line of output. | `evidence/benchmark/clean-start.log` |

```bash
npm run bench:run -- --provider=ollama --model=llama3.2:1b --iterations=5
npm run bench:run -- --provider=groq --iterations=10
npm run bench:evidence:failures
npm run bench:clean-start -- --dry-run          # print the plan, run nothing
npm run bench:clean-start -- --with-install     # include `npm ci` (slow)
```

`bench:clean-start` needs Docker. Without it, `--skip-docker` captures the Node
half and marks the Docker steps as skipped in the log rather than pretending
they passed.

The fourteen steps it runs, in order: `docker --version`, `docker compose
version`, `docker compose --profile ollama up -d`, `docker compose ps`, a poll
of the Ollama HTTP API, `ollama pull`, `ollama list`, optionally `npm ci`,
`node --version && npm --version`, `npx prisma generate`, `npx tsc --noEmit`,
`npm run lint`, `npx jest tests/benchmark --ci`,
`npm run bench:evidence:failures`, `npm run build`, and finally
`npm run bench:run`. Two are marked optional and will not fail the capture:
`npx prisma generate`, which needs to reach `binaries.prisma.sh`, and
`npm run build`, which needs both a generated Prisma client and network access
to Google Fonts for `next/font` in `src/app/layout.tsx`. An optional step that
fails is written into the log with its real error rather than hidden.

---

## Documented error behaviour

Every provider failure is mapped onto exactly one of these eight codes before it
leaves an adapter. Nothing throws across the module boundary: a failed iteration
is still a measurement, and the reliability score counts it.

The code is carried inside the shared `error_message` string as
`"<code>: <message>"`, so it survives to the runner without changing a port
another team member owns. `decodeFailure()` reads it back.

| Code | HTTP | Falls back? | What it means | What to do |
|---|---|---|---|---|
| `timeout` | 504 | yes | No answer within `BENCHMARK_TIMEOUT_MS`. Aborted; no partial result is recorded as measured. | A cold model can take a minute to load on the first call. Raise the budget rather than reading a load as a timeout. |
| `local_unavailable` | 503 | yes | Nothing is listening on `OLLAMA_HOST`. | `docker compose --profile ollama up -d`, or correct the host. |
| `invalid_model` | **422** | **no** | The provider does not have that model name. | Fix the name, or `ollama pull` it. 422 and not 400: the request was well-formed, it just named a model that does not exist. |
| `unauthorized` | 502 | **no** | The credential was missing, malformed or rejected. | Fix the key in `.env`. |
| `rate_limited` | 429 | yes | The provider applied a rate limit or quota. | Wait, or let the chain fall back. |
| `invalid_response` | 502 | yes | The provider answered, but the payload did not parse. | Usually a proxy or gateway between you and the provider. |
| `not_configured` | 503 | yes | No credential or host in this environment, so it was never called. | Fill in `.env`. |
| `provider_error` | 502 | yes | Anything else the provider reported. | Read the message. |

### The fallback rule, in one sentence

> Fall back only when the provider failed for a reason another provider could
> plausibly not share.

That is why `invalid_model` and `unauthorized` stop the chain. Falling back
after a rejected key hides a configuration fault behind a working answer; falling
back after a bad model name answers a question nobody asked, because the caller
asked to measure *that* model on *that* provider.

Unconfigured providers are **excluded from the chain**, not attempted. Calling a
provider with no key would produce an `unauthorized` result, and that would be
recorded as a failed measurement of the provider rather than what it actually
is — a gap in this machine's setup.

`evidence/benchmark/failure-modes.json` is the generated proof that the code
behaves this way. Each fallback record carries
`behaved_as_documented: <secondProviderCalled> === <codeIsRetryable>`, which is
the whole policy as a single boolean.

### A 200 with nothing in it is a failure, not a zero

If a provider returns HTTP 200 but the stream contains no parseable content, no
token count and no first-token signal, the adapter reports `invalid_response`
rather than a successful iteration. This is not hypothetical: a proxy or load
balancer answering 200 with an HTML error page produces exactly that. Recording
it as a success would raise the reliability score and attach a real-looking
stopwatch reading to a request that produced nothing — a fabricated measurement,
which is the one thing this module must not produce.

---

## What gets measured, and what does not

| Field | Provenance | Notes |
|---|---|---|
| `latency_ms` | `measured` | Wall clock, always recorded — including for a failure. How long a provider took to fail is evidence, and a timeout's latency is the timeout budget. |
| `ttft_ms` | `measured` / `unavailable` | Requires streaming, and is taken on the first chunk carrying **content** — several providers send a role or a preamble first. |
| `tokens_per_second` | `derived` / `unavailable` | Output tokens ÷ generation window. Where the provider reports its own generation time (Groq's `completion_time`, Ollama's `eval_duration`) that is the denominator, because it excludes queueing. Wall clock otherwise. |
| `outputTokens` | `measured` / `unavailable` | Only when the provider reports it. Never estimated from character count. |
| cost | — | **Not measured.** No cost model exists. Any cost input to the readiness score is labelled `ASSUMPTION: Cost`. |
| output quality | — | **Not measured.** Nothing here judges whether an answer was any good. |
| hardware fit | — | **Not measured** by this module. It needs the device profile (Moe's package) and is labelled `ASSUMPTION: Hardware fit`. |

Every aggregate is nullable and no aggregate is invented. Percentiles are
withheld below three samples, because a p95 of two numbers is not a p95.

Iterations run **sequentially** on purpose. Running them concurrently makes them
contend for the same GPU, and the resulting figures measure queueing rather than
inference.

---

## Demo adapter

The acceptance criteria allow "Ollama and at least one cloud provider work, **or
a documented demo adapter substitutes**". This is that documented substitute,
and this section is what `DemoProvider.describe()` cites as its source.

```bash
BENCHMARK_ALLOW_DEMO=true npm run bench:run -- --provider=demo
```

**It produces no measurements.** Every figure it returns is labelled
`simulated`, the runner marks any run that touched it, and the API response
carries `simulated: true` all the way to the dashboard. It is deterministic —
the same prompt always yields the same figures — so a demo is reproducible and
obviously synthetic.

It exists so the API, the persistence layer and the dashboard can be exercised
end to end on a machine with no GPU, no Ollama and no API keys: in CI, or during
a presentation on someone else's laptop.

It is registered **only** when `BENCHMARK_ALLOW_DEMO=true`. Leave it unset
everywhere else. A registry that silently contains a simulator is a registry
that can silently return fabricated numbers, and a number labelled `simulated`
in a JSON file becomes an unlabelled number the moment someone pastes it into a
slide. Do not put a demo figure in a report.

---

## Troubleshooting

**Port 5432 is already in use.** Another Postgres — often a container from an
older copy of this repository — has it. Find and stop it:

```bash
docker ps --filter publish=5432
docker stop <container>
```

**`local_unavailable` even though the container is running.** From inside a
container, `localhost` is that container. The app service in
`docker-compose.yml` therefore sets `OLLAMA_HOST=http://ollama:11434`, using the
service name. On the host it is `http://localhost:11434`.

**The first call times out, later ones do not.** The model was cold and had to
load. `OLLAMA_KEEP_ALIVE: '30m'` in compose keeps it resident between
iterations so an unload/reload never lands mid-benchmark; the very first call
after a container start is still slow. Raise `BENCHMARK_TIMEOUT_MS`, or do one
throwaway call first.

**`npm test` leaves modified files in `evidence/vision-benchmark/`.** The
`pretest` hook regenerates the vision fixtures. That is another team member's
module. Use `npx jest tests/benchmark` while iterating, and
`git checkout -- evidence/vision-benchmark` before committing.

**Two vision tests fail under a bare `npx jest`.** They need fixtures that
`pretest` generates. `npm run vision:fixtures` first, or run the full
`npm test`. Not a regression.

**Prisma cannot reach the database.** Check `DATABASE_URL`. On a pooled host
like Neon, `DATABASE_URL` is the pooled URL (`-pooler` in the hostname) and
`DIRECT_URL` is the same string without it — schema changes cannot go through a
connection pooler.

---

## Official sources

- Ollama streaming API and `eval_count` / `eval_duration` (nanoseconds) —
  <https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion>
- Gemini `streamGenerateContent` and `usageMetadata` —
  <https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent>
- Groq chat completions, `stream_options.include_usage` and `completion_time`
  (seconds) — <https://console.groq.com/docs/api-reference#chat-create>

Per-decision reasoning and the rest of the sources are in
[`docs/benchmark/research-log.md`](./benchmark/research-log.md).
