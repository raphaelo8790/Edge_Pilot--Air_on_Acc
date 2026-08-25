# Internal documentation

This folder is for **maintainers and contributors working on the codebase**.  
It is not aimed at end users of the EdgePilot AI app.

| Doc | Purpose |
|-----|---------|
| [architecture.md](./architecture.md) | Hexagonal architecture, modules, data flow, schema notes |
| [database.md](./database.md) | Local vs shared database, migrations, seeding, schema conventions |
| [benchmark-api.md](./benchmark-api.md) | Wire contract for `/api/v1/benchmarks`, `/providers`, `/readiness/[id]` — request and response shapes, every status, the eight error codes |
| [team-workflow.md](./team-workflow.md) | Branching, PRs, commits, review habits |
| [project-plan.md](./project-plan.md) | Timeline / evaluation notes (if still relevant) |

Benchmark and provider layer:

| Doc | Purpose |
|-----|---------|
| [`docs/benchmark/README.md`](../benchmark/README.md) | Branch guide — what is in it, the decisions, the evidence, the known gaps |
| [`docs/local-model-setup.md`](../local-model-setup.md) | Clean-machine setup: Docker, WSL2, Ollama, keys, verification, troubleshooting |
| [`docs/benchmark/research-log.md`](../benchmark/research-log.md) | Per-decision reasoning with official sources; what is deliberately not measured |

Public-facing entry points:

- App story & user install → root [`README.md`](../../README.md)
- External contribution guide → [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

**Note:** Team coordination happens in our Telegram group. No contact information is stored in the repository.
