# Vision Provider Execution

## Prerequisites

```bash
npm ci
npm run vision:fixtures
npm run vision:validate
```

## Controlled local and cloud evidence

Controlled evidence validates both provider kinds without network credentials:

```bash
npm run vision:evidence:controlled
npm test -- --runInBand
```

The generated files are:

- `evidence/vision-benchmark/controlled-ollama.json`
- `evidence/vision-benchmark/controlled-gemini.json`

They are explicitly marked `executionMode: controlled` and must not be
described as live model measurements.

## Live Ollama run

Install Ollama, pull a vision-capable model, and make sure the local server is
running:

```bash
ollama pull gemma4
npm run vision:run:ollama
```

Optional environment variables:

```text
OLLAMA_HOST=http://localhost:11434
OLLAMA_VISION_MODEL=gemma4
VISION_DEVICE_PROFILE_ID=local-workstation
```

Ollama vision models accept images alongside text and the REST API expects
base64 image data:
[Ollama Vision](https://docs.ollama.com/capabilities/vision).

## Live Gemini run

Set a server-only API key and run:

```bash
npm run vision:run:gemini
```

Required and optional environment variables:

```text
GEMINI_API_KEY=replace-with-a-real-server-only-key
GEMINI_VISION_MODEL=gemini-3.6-flash
VISION_DEVICE_PROFILE_ID=local-workstation
```

Never use a `NEXT_PUBLIC_` prefix for the API key. Gemini documents inline
base64 image input and classification in its
[Image understanding guide](https://ai.google.dev/gemini-api/docs/image-understanding).

## Live Groq run

Groq speaks the OpenAI chat-completions dialect and only some of its models
accept an image (the Llama 4 family at the time of writing). Set a server-only
key and name one of those:

```bash
npm run vision:run:groq -- --model=meta-llama/llama-4-scout-17b-16e-instruct
```

```text
GROQ_API_KEY=replace-with-a-real-server-only-key
```

The project's own Groq key has no access to an image-capable model, which is
why no live Groq evidence is committed; the adapter is covered by tests.

## Running from the page, and where each run happens

`/vision-benchmark` runs the same built-in dataset on Ollama, Gemini or Groq.
The two kinds of provider run in different places, and the evidence says which:

- **Ollama** runs **in the visitor's browser**, against the Ollama on their own
  computer. The page fetches the manifest and the 21 images from
  `GET /api/v1/vision-benchmarks/dataset`, runs the shared executor with the
  browser image processor (`browser-canvas-png-v1`) and the browser Ollama
  adapter, then reads residency for hardware fit. The server makes no model
  call. This is what makes a hosted site work: a server has no Ollama and
  cannot reach a visitor's machine. The visitor must allow the site's origin
  once (`OLLAMA_ORIGINS`); `/setup` shows the command per operating system.
- **Gemini and Groq** run **on the server**, through the server action in
  `src/app/vision-benchmark/actions.ts`, because that is where a key can be
  kept out of a web page. A visitor's own key (pasted on `/setup`) is used
  when present; otherwise the site's, capped per visitor per hour. Cloud runs
  classify seven images at a time to fit a serverless time limit; a local run
  is always sequential, because two requests to one GPU measure contention.

Both paths call `executeVisionBenchmark` with the same workload id, prompt,
prompt version and manifest digest, so a row from the page is directly
comparable to a row from the terminal.

## Evidence output

A successful command writes a timestamped `live-*.json` file under
`evidence/vision-benchmark/`. Live evidence files are ignored by Git by
default because they can contain machine-specific measurements.

The comparison page reads controlled and local live evidence from:

```text
http://localhost:3000/vision-benchmark
```

## Authenticated API execution

Set `VISION_BENCHMARK_API_TOKEN` on the server. Send the same token as a bearer
token to:

```text
POST /api/v1/vision-benchmarks
```

Example body:

```json
{
  "workloadId": "construction-component-recognition-v1",
  "provider": "gemini",
  "model": "gemini-3.6-flash",
  "deviceProfileId": "local-workstation",
  "gitCommitSha": "0123456789abcdef0123456789abcdef01234567",
  "promptVersion": "1.0.0",
  "prompt": "Classify the single primary construction-safety component in the image. Allowed labels: hardhat, safety_vest, gloves, goggles, mask, ladder, safety_cone. Return only one allowed label with no explanation or punctuation."
}
```

Provider execution is disabled with HTTP `503` when the server token is
missing and rejected with HTTP `401` when the bearer token is wrong.
