# Pull Request Delivery

## Suggested title

```text
feat(vision-benchmark): complete provider evaluation and evidence workflow
```

## Suggested description

```markdown
Closes #1

## Scope

- Defines a bounded seven-class construction-component workload.
- Adds a reproducible 21-image synthetic fixture dataset.
- Records source, MIT license, labels, privacy review, and SHA-256 hashes.
- Adds runtime Zod request, manifest, evidence, metrics, and dashboard schemas.
- Adds safe Sharp preprocessing with path, size, pixel, metadata, and hash checks.
- Adds real Ollama and Gemini image-capable adapters.
- Adds deterministic evaluation metrics and explicit quality gates.
- Adds controlled local/cloud evidence and a comparison dashboard.
- Adds authenticated benchmark API execution.
- Adds 48 documented automated test cases.
- Adds the two-minute explanation and live modification demo.

## Verification

- npm run vision:validate
- npm run lint
- npx tsc --noEmit
- npm test -- --runInBand
- npm run build

## Evidence

- Dataset: datasets/vision-benchmark/manifest.json
- Controlled results: evidence/vision-benchmark/
- Delivery report: docs/vision-benchmark/evidence-report.md

## Limitations

The bundled dataset is synthetic and validates the system workflow. It does not
estimate real construction-site accuracy. Controlled evidence is explicitly
labeled and is not presented as live provider performance.
```
