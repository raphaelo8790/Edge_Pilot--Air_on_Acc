# AI usage

How AI assistance was used in building EdgePilot AI, what was verified, and
what a reader should therefore trust or check.

One section per work package. Each owner is responsible for their own entry.

---

## Benchmark and provider layer — Adham Yakout

*Scope: the server-side provider abstraction (Ollama, Gemini, Groq), the
benchmark API, timeout/fallback behaviour, Docker/WSL setup, and the
reproducible performance capture. Files under
`src/modules/benchmark/`, `scripts/benchmark/`, `tests/benchmark/`,
`docs/benchmark/`, `docs/local-model-setup.md`, `Dockerfile`,
`docker-compose.yml`.*

### What AI was used for

**Drafting implementation code.** The four provider adapters, the shared
`BaseProvider`, the registry, the runner, the measurement DTOs and the three
evidence scripts were drafted with AI assistance and then edited, restructured
and in several places rewritten by hand. The architecture decisions — nothing
throws across the module boundary, every figure carries a provenance label,
every aggregate is nullable, the fallback rule — are mine; they are argued for
in [`docs/benchmark/research-log.md`](./docs/benchmark/research-log.md) and I
can defend each one.

**Writing tests.** The 122 tests in `tests/benchmark/` were drafted with AI
assistance against cases I specified: normal path, invalid input, timeout,
fallback, ownership, persistence failure, and total failure. Every one of them
was run.

**Documentation.** The four documents in `docs/` were drafted with AI
assistance from the actual contents of the code, then checked line by line
against it.

**Explaining unfamiliar API surfaces.** Ollama's NDJSON framing, Gemini's SSE
`alt=sse` mode and Groq's `stream_options.include_usage`. Every claim taken
from those explanations was then confirmed against the vendor's own
documentation before it went into the code — the URLs are in the research log
and in the header comment of each adapter.

### What was verified, and how

Nothing in this branch is reported as working on the strength of an AI saying
it works. Specifically:

| Claim | How it was checked |
|---|---|
| The code compiles and typechecks | `npx tsc --noEmit`, exit 0 |
| The tests pass | `npx jest tests/benchmark` — 11 suites, 122 tests, captured output |
| Lint is clean | `npm run lint` |
| The app builds | `npm run build` |
| The documented error codes still behave as documented | `npm run bench:evidence:failures`, which exits non-zero on any mismatch and writes `evidence/benchmark/failure-modes.json` |
| The setup sequence works | `npm run bench:clean-start`, which records every command and its real exit code in `evidence/benchmark/clean-start.log` |

The typecheck is worth singling out. `tsx` strips types without checking them,
so the evidence scripts had run correctly for days while carrying two real type
errors. The first `tsc --noEmit` over this work found nine errors across three
files. **AI-drafted code that runs is not AI-drafted code that is correct**, and
the gate that caught the difference is now a step in `bench:clean-start`.

### What AI was *not* used for

**No performance figure in this repository was generated, estimated or
suggested by an AI.** Every measured number comes from
`npm run bench:run` executing real inference against a real provider, and lands
in `evidence/benchmark/measured-*.json` with a machine snapshot attached. Where
a provider did not report a figure, the field is `null` — not an estimate.

**No source in the documentation was produced from memory.** Every vendor URL
cited in the research log and in the adapter headers points at official
documentation, and each was opened and read.

**Cost and output quality were not modelled at all**, by AI or otherwise. They
are emitted as `ASSUMPTION:` lines wherever they feed a readiness score, and
the API returns them separately from measured evidence so a client cannot
display a score without its caveats.

### Known limits of this disclosure

Comment prose and variable naming throughout the module are heavily
AI-influenced; I have read all of it, but I would not claim every sentence
originated with me. Where an explanation in a comment matters — the unit
conversions, the es5 `instanceof` hazard, the fallback rule — it is backed by a
test or a cited source rather than by the comment alone.

---

## Other work packages

Each owner adds their own section here. Suggested shape, so the file stays
comparable across the team: what AI was used for, how the resulting work was
verified, what it was deliberately not used for, and any limits worth stating.

- Integration and API surface
- UI and dashboard
- Device knowledge and quality (removed from this build - see 00-PROJECT-RECORD.md, change 22)
- Vision benchmark
