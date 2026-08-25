# `src/modules/benchmark/core/entities/` - domain entities

**Work package:** benchmark and provider layer.

## What this folder is

One file holding the three shapes the domain reasons about.

## What happened here

`Benchmark.ts` changed by 14 lines: `deviceId` came off `Benchmark`, and
`ReadinessScore` gained a nullable `hardwareFit` and a `privacyClass`. Those two
type changes are the domain-level statement of two decisions - that a hardware
fit may be genuinely unknown rather than defaulted, and that privacy is a class
and not a score.

## Files

| File | What it is |
|---|---|
| `Benchmark.ts` | 49 lines. `Benchmark`, `BenchmarkResult`, `ReadinessScore` |

## Connected folders

- [`../services/`](../services/FOLDER.md) - what computes these.
- [`../../infrastructure/repositories/`](../../infrastructure/repositories/FOLDER.md) -
  what maps them to and from Postgres.
- [`prisma/`](../../../../../prisma/FOLDER.md) - the tables they correspond to.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/benchmark/core/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
