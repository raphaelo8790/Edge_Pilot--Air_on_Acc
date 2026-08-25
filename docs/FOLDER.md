# `docs/` - long-form documentation

**Work package:** shared; each subfolder belongs to the module it describes.

## What this folder is

The written record: architecture, wire contracts, setup, research reasoning,
and per-module guides. `00-PROJECT-RECORD.md` at the root is the history;
this folder is the reference.

## What happened here

`docs/deployment.md` was removed. It described a deployment that does not
exist - there is no public URL - and a document that describes a thing into
existence is worse than an admission that the thing is missing. The honest
version is section 6 of `00-PROJECT-RECORD.md`.

`docs/internal/README.md` was updated to point at the current set.

One document in here is **known stale** and is listed as a gap rather than
quietly patched: `docs/internal/database.md` line 147 still says users own
"devices", and it does not mention `shared_findings`, `session_id`, `warmup`
or `privacy_class`.

## Files

| Subfolder / file | What it is |
|---|---|
| `local-model-setup.md` | 352 lines. Clean machine to measured benchmark: Docker, WSL2, Ollama, API keys, verification, troubleshooting, and the error-code table |
| [`benchmark/`](benchmark/FOLDER.md) | The benchmark and provider layer guide, plus its research log |
| [`dashboard/`](dashboard/FOLDER.md) | The dashboard module guide |
| [`internal/`](internal/FOLDER.md) | Architecture, database, wire contract, team workflow, project plan |
| [`vision-benchmark/`](vision-benchmark/FOLDER.md) | Dataset card, workload spec, provider execution, test cases, evidence report |

## Connected folders

- [`/`](../FOLDER.md) - `README.md` and `CONTRIBUTING.md` are the public-facing
  counterparts to this folder.
- [`src/modules/benchmark/`](../src/modules/benchmark/FOLDER.md) and
  [`src/modules/vision-benchmark/`](../src/modules/vision-benchmark/FOLDER.md) -
  the code these documents describe.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`tests/benchmark/`](../tests/benchmark/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
