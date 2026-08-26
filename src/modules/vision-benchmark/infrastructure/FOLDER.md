# `src/modules/vision-benchmark/infrastructure/` - adapters

**Work package:** vision benchmark.

## What this folder is

Nine files. Two providers and one image processor for the server; one provider
and one image processor for the **browser**; plus manifest loading, evidence
writing, transport and the run service.

## What happened here

**The bug that mattered most in the whole project is in this folder.**
`evidence-store.ts` validated filenames against a lowercase-only pattern and
then built them from an ISO timestamp containing `T` and `Z`. Nine lines
differ; one of them is a `.toLowerCase()`; and before it, no live run had ever
managed to write its evidence.

**The two browser adapters are new**, and they exist for a reason worth stating
plainly. `SharpVisionImageProcessor` reads files from disk with a Node library,
and `OllamaVisionProvider` builds its base64 with `Buffer`, which does not exist
in a browser. For a user's own photographs both are the wrong machine twice
over: the images would have to travel to the server, and the model measured
would be the server's rather than the user's. So the browser pair prepares
images in the tab and talks straight to the user's own Ollama on localhost.

Two details in them are load-bearing:

- **The version string is deliberately different.** `browser-canvas-png-v1`, not
  `sharp-png-v1`. Canvas and sharp do not resample or encode PNG identically, so
  runs prepared by each must never be treated as comparable by accident.
- **Determinism is preserved.** `temperature: 0` and `seed: 42`, identical to
  the server adapter.

Both browser files also hit the same TypeScript trap twice: with `target: es5`
and no `downlevelIteration`, spreading a typed array is a hard compile error.
Both now use `String.fromCharCode.apply(null, Array.from(...))`.

## Files

| File | What it is |
|---|---|
| `evidence-store.ts` | 106 lines. `FileVisionEvidenceStore` - writes the artefacts. The filename fix lives here |
| `browser-image-processor.ts` | 181 lines. Canvas resize to 512, `crypto.subtle` SHA-256, JPEG APP1 EXIF detection. `preprocessingVersion = 'browser-canvas-png-v1'` |
| `browser-ollama-provider.ts` | 171 lines. `providerName = 'ollama-browser'`, posts to the user's own `/api/chat` from the tab |
| `image-processor.ts` | 174 lines. `SharpVisionImageProcessor` - the server-side equivalent |
| `ollama-provider.ts` | 139 lines. The server-side local vision adapter |
| `gemini-provider.ts` | 174 lines. The Gemini cloud vision adapter |
| `groq-provider.ts` | The Groq cloud vision adapter: OpenAI chat-completions dialect, image as a data URL, temperature 0, key in the Authorization header. Only the Llama 4 family accepts images; the catalogue marks which |
| `manifest-loader.ts` | 50 lines. Loads and validates `datasets/vision-benchmark/manifest.json`, including its SHA-256 |
| `run-service.ts` | 80 lines. `runVisionBenchmarkRequest` - what the API route calls |
| `http.ts` | 38 lines. The injected `fetch` and clock. A deliberate copy of the benchmark module's, not a shared import |

## Connected folders

- [`../application/`](../application/FOLDER.md) - the ports these implement.
- [`src/components/vision/`](../../../components/vision/FOLDER.md) - the upload
  panel that mounts the two browser adapters.
- [`evidence/vision-benchmark/`](../../../../evidence/vision-benchmark/FOLDER.md) -
  what `evidence-store.ts` writes, and why one file there is explicitly
  un-ignored.
- [`datasets/vision-benchmark/`](../../../../datasets/vision-benchmark/FOLDER.md) -
  what `manifest-loader.ts` reads.
- [`src/app/api/v1/vision-benchmarks/`](../../../app/api/v1/vision-benchmarks/FOLDER.md) -
  the route that calls `run-service.ts`, and why it sets `runtime` explicitly.
- [`tests/vision-benchmark/`](../../../../tests/vision-benchmark/FOLDER.md) -
  `vision-infrastructure.test.ts`, `vision-providers.test.ts`.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/modules/vision-benchmark/`](../FOLDER.md)
- [`src/modules/vision-benchmark/core/`](../core/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
