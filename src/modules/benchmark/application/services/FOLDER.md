# `src/modules/benchmark/application/services/` - the runner

**Work package:** benchmark and provider layer.

## What this folder is

One file, and the most-changed file in the module: 662 lines, 269 of them
differing from the team's version.

It runs one benchmark request against the provider chain and turns raw adapter
output into the typed envelope. It does no I/O of its own beyond the providers
it is handed, and it knows nothing about the database.

## What happened here

**The cold start.** The runner now runs N+1 iterations and discards the first.
Measured on the same 8B model in one session: TTFT 36,445 ms cold against 369 ms
warm, a factor of 99, with readiness swinging 75 to 90 on load state alone. The
discarded iteration is not deleted - it is reported with its own duration and
stored with `warmup: true`, so the arithmetic can be checked from the database
rows.

**The counting bug that followed.** With the warm-up added, a request for three
iterations reported "4/4 iterations succeeded". Success, dominant failure code
and the summary now all read from `responses.slice(1)`. The fix went into the
runner rather than into the assertion that caught it.

**The residency probe.** A pre-run probe records what memory looked like before
the model was asked anything, which is what hardware fit is computed against.
Its result is null-guarded explicitly - the first version's `catch` produced the
right value for the wrong reason, which would have masked any other fault.

**The fallback policy**, unchanged and worth restating: fall back only when the
provider failed for a reason another provider could plausibly not share.

## Files

| File | What it is |
|---|---|
| `BenchmarkRunner.ts` | 663 lines. The run loop, the cold start, the residency probe, the fallback chain, and `DEFAULT_UNMEASURED_INPUTS` |

## Connected folders

- [`../dtos/`](../dtos/FOLDER.md) - the envelope it produces.
- [`../use-cases/`](../use-cases/FOLDER.md) - `RunBenchmark`, which persists what
  it returns.
- [`../../core/services/`](../../core/services/FOLDER.md) - hardware fit,
  readiness, task compatibility.
- [`../../infrastructure/`](../../infrastructure/FOLDER.md) -
  `OllamaResidencyProbe.ts`.
- [`prisma/migrations/`](../../../../../prisma/migrations/FOLDER.md) - the
  `warmup` column.
- [`tests/benchmark/`](../../../../../tests/benchmark/FOLDER.md) -
  `benchmark-runner.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/benchmark/application/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
