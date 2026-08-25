# Vision Benchmark Dataset

This directory defines the controlled dataset for
`construction-component-recognition-v1`.

## Scope

- Seven construction-safety component labels.
- Three deterministic synthetic images per label.
- Exactly one primary component in each image.
- No people, faces, personal data, location data, or EXIF metadata.

## Source and license

The project generates every image from deterministic drawing primitives in
`scripts/vision-benchmark/generate-fixtures.mjs`. The generated fixtures are
covered by the repository MIT license. No external image or dataset is copied.

## Generate and verify

```bash
npm run vision:fixtures
npm run vision:validate
```

The generator recreates the 21 PNG files and verifies their paths, labels, and
SHA-256 values against `manifest.json`. Generated image files remain untracked
to keep the repository small and reproducible.

## Intended use

This dataset validates data flow, image preprocessing, provider integration,
metrics, evidence capture, and dashboard comparison. It is not a production
accuracy dataset and must not be used to claim real construction-site model
performance.
