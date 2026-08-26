# `src/modules/benchmark/infrastructure/` - adapters and wiring

**Work package:** benchmark and provider layer.

## What this folder is

Everything that talks to something outside the process - HTTP, Prisma, the
environment - plus the one place where it is all wired together.

## What happened here

Two new adapters, and both of them exist to answer a question the application
used to answer too late or not at all.

`OllamaResidencyProbe.ts` reads what actually happened to memory during a local
run, which is what turned hardware fit from a constant into a measurement.
`OllamaCatalog.ts` answers "is Ollama running and what does this machine have"
**before** a benchmark is attempted rather than after one fails.

`config.ts` grew by 41 lines and `container.ts` by 37, both because there is
more to wire.

## Files

| File | What it is |
|---|---|
| `container.ts` | 78 lines. The composition root. Routes ask for a fully wired use case and get one; they never construct an adapter, read an environment variable, or touch Prisma. Every wiring decision is in this one readable place |
| `config.ts` | 184 lines. Reads and validates the environment once, with documented defaults, so a misconfiguration surfaces as a **named variable** rather than a stack trace three layers down. Also refuses to evaluate in a browser bundle - every value here is a secret or a host that must stay server-side. The guard is a runtime check because `server-only` is not a dependency, and it is still worth having: it turns an accidental client import into an immediate, explicit failure at the point of the mistake |
| `CloudCatalog.ts` | The same question for Gemini and Groq: which models may the configured key run, asked over each vendor's list-models endpoint with the key in a header. Narrowed to text generators; audio, embedding and safety models are counted, not shown. Replaces the free-text model box and its hardcoded suggestion list |
| `OllamaCatalog.ts` | 223 lines. Runtime status and the installed-model list. Exists because `isConfigured()` only reports whether a host string is set - whether anything is listening is a runtime question, and the user was learning the answer from a failed benchmark |
| `visitor-keys.ts` | A visitor's own Gemini/Groq keys, read from two request headers, laid over the server's config for that one request. A registry built with them is never cached. Never logged, stored or echoed |
| `browser-ollama.ts` | The visitor's OWN Ollama, reached from their browser tab. Hosted, the server's "localhost" is a datacentre container with no Ollama; only the page in the visitor's browser can reach theirs. Reuses `OllamaCatalog`, `OllamaProvider` and `OllamaResidencyProbe` unchanged (they are plain `fetch`), adds the CORS remedy (`OLLAMA_ORIGINS`) a hosted page needs, and packages a run as the `recorded` field the benchmark and comparison routes accept. Never reads `process.env` |
| `OllamaResidencyProbe.ts` | 107 lines. `GET /api/tags` for size on disk, `GET /api/ps` for `size` (total resident, including the KV cache for the context window) and `size_vram` (how many of those bytes are on the GPU). `size_vram / size` is the fit signal, and it is reported by the runtime rather than inferred by us |

## Subfolders

| Subfolder | What is in it |
|---|---|
| [`providers/`](providers/FOLDER.md) | The five adapters, the registry, the error vocabulary, transport helpers |
| [`repositories/`](repositories/FOLDER.md) | The Prisma implementations |

## Connected folders

- [`../core/ports/`](../core/ports/FOLDER.md) - the interfaces implemented here.
- [`../core/services/`](../core/services/FOLDER.md) - `HardwareFitAssessor`
  consumes the probe's observation.
- [`src/app/api/v1/`](../../../app/api/v1/FOLDER.md) - every route calls
  `container.ts` and nothing else here.
- [`src/app/api/v1/local-runtime/`](../../../app/api/v1/local-runtime/FOLDER.md) -
  the catalogue's endpoint.
- [`tests/benchmark/`](../../../../tests/benchmark/FOLDER.md) -
  `benchmark-config.test.ts`, `ollama-catalog.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`prisma/`](../../../../prisma/FOLDER.md)
- [`src/app/api/v1/benchmarks/`](../../../app/api/v1/benchmarks/FOLDER.md)
- [`src/app/api/v1/providers/models/`](../../../app/api/v1/providers/models/FOLDER.md)
- [`src/app/setup/`](../../../app/setup/FOLDER.md)
- [`src/modules/benchmark/`](../FOLDER.md)
- [`src/modules/benchmark/application/`](../application/FOLDER.md)
- [`src/modules/benchmark/application/services/`](../application/services/FOLDER.md)
- [`src/modules/benchmark/core/`](../core/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
