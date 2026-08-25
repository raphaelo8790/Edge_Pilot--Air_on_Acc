# `src/modules/benchmark/core/ports/` - the boundary

**Work package:** benchmark and provider layer.

## What this folder is

Two interface files, 44 lines together. They are the whole reason this module
can be called hexagonal without qualification: the domain declares what it needs,
and `infrastructure/` supplies it.

Because these are interfaces and nothing else, the test suite can hand the
application layer a `FakeProvider` and an in-memory repository and exercise the
real runner and the real use case with no network and no database.

## What happened here

Unchanged. That is the interesting part - eight new services, a new use case, a
removed module and four migrations all landed without needing to move the
boundary. A boundary that survives that much change is one that was drawn in
the right place.

## Files

| File | What it is |
|---|---|
| `AIProvider.ts` | 26 lines. What a provider must be able to do |
| `BenchmarkRepository.ts` | 18 lines. What persistence must be able to do |

## Connected folders

- [`../../infrastructure/providers/`](../../infrastructure/providers/FOLDER.md) -
  five implementations of `AIProvider`.
- [`../../infrastructure/repositories/`](../../infrastructure/repositories/FOLDER.md) -
  the Prisma implementation of `BenchmarkRepository`.
- [`tests/benchmark/`](../../../../../tests/benchmark/FOLDER.md) -
  `helpers.ts` implements both with test doubles.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/benchmark/core/`](../FOLDER.md)
- [`src/modules/benchmark/infrastructure/`](../../infrastructure/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
