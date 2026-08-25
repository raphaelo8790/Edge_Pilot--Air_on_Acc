# `src/modules/benchmark/infrastructure/repositories/` - persistence

**Work package:** benchmark and provider layer, over the integration layer's
schema.

## What this folder is

The only code in the benchmark module that talks to Prisma.

## What happened here

`PrismaBenchmarkContext.ts` shrank from 46 lines to 35, because the device
lookup went with the device table. `PrismaBenchmarkRepository.ts` gained the
`warmup` flag on iteration rows and the nullable `hardwareFit`.

Three mapping rules hold here and are written into the files:

- The port speaks camelCase; the database is snake_case. The `@map()`
  directives in `schema.prisma` do that translation, so nothing here has to.
- `evidence` and `limitations` are Json columns, typed by Prisma as
  `JsonValue`, cast back to `string[]` on the way out. The entity declares
  `string[]` and the writer only ever puts strings in.
- **Nothing here swallows an error.** A caller that wants to degrade gracefully
  when the database is down decides that for itself - and `RunBenchmark` does
  exactly that, returning the measurement with `persisted: false`. A repository
  that silently reported success would be worse than one that fails loudly.

## Files

| File | What it is |
|---|---|
| `PrismaBenchmarkRepository.ts` | 255 lines. The `BenchmarkRepository` implementation - saving runs, iterations and readiness scores, and reading them back |
| `PrismaBenchmarkContext.ts` | 36 lines. The narrow lookup the use case needs: who owns the workload, and what uuid a provider slug maps to. Two small queries with `select` clauses rather than full row fetches - the prompt column on a workload can be large |

## Connected folders

- [`../../core/ports/`](../../core/ports/FOLDER.md) - the interface implemented.
- [`../../application/use-cases/`](../../application/use-cases/FOLDER.md) - the
  caller that decides how to degrade.
- [`src/lib/`](../../../../lib/FOLDER.md) - the `PrismaClient` singleton.
- [`prisma/`](../../../../../prisma/FOLDER.md) - the schema and its `@map()`
  directives.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/benchmark/core/entities/`](../../core/entities/FOLDER.md)
- [`src/modules/benchmark/infrastructure/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
