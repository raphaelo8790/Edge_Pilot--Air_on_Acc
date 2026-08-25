# Dataset Card: EdgePilot Synthetic Construction Components

## Identity

- Dataset ID: `edgepilot-synthetic-construction-components-v1`
- Workload: `construction-component-recognition-v1`
- Manifest version: `1.0.0`
- Size: 21 PNG images
- Resolution: 256 × 256
- Balance: three images for each of seven labels

## Source

The dataset is generated entirely inside this repository by
`scripts/vision-benchmark/generate-fixtures.mjs`. The generator uses
deterministic raster drawing primitives and a deterministic PNG encoder. No
external image, dataset, logo, person, or location is copied.

Repository source:
[Edge_Pilot--Air_on_Acc](https://github.com/raphaelo8790/Edge_Pilot--Air_on_Acc).

## License

The generated fixtures use the repository MIT license. Redistribution and
commercial use are allowed under that license. Each manifest sample records
`licenseSpdx: MIT` and `licenseVerified: true`.

## Labels

| Label | Samples |
|---|---:|
| `hardhat` | 3 |
| `safety_vest` | 3 |
| `gloves` | 3 |
| `goggles` | 3 |
| `mask` | 3 |
| `ladder` | 3 |
| `safety_cone` | 3 |

## Privacy review

The fixture set was manually reviewed and contains:

- No people.
- No faces.
- No personal data.
- No readable identifiers.
- No location information.
- No EXIF, XMP, or IPTC metadata.

The runtime processor independently rejects prohibited metadata.

## Integrity and reproducibility

Every sample has a SHA-256 value in `manifest.json`. Run:

```bash
npm run vision:fixtures
npm run vision:validate
```

The first command regenerates the images and verifies every path, label, and
hash. The second parses the Zod manifest, verifies all 21 files, applies the
production preprocessing pipeline, and reports the class distribution.

## Intended use

Use this dataset for:

- Provider-contract tests.
- Preprocessing and privacy checks.
- Deterministic metric tests.
- Evidence capture.
- Local/cloud comparison-dashboard integration.
- Classroom and live-demo workflows.

Do not use it for:

- Production accuracy claims.
- Construction-site safety decisions.
- Object detection or localization claims.
- Fairness, robustness, or domain-generalization claims.

## Known limitations

The images are clean synthetic icons with one centered component. They do not
represent occlusion, poor lighting, camera noise, clutter, scale variation,
people wearing equipment, or construction-site domain shift. A production
benchmark must add a separately licensed, privacy-reviewed real-world dataset.

## Manifest version history

**1.0.1** - the `source.repository` metadata field was repointed at this
repository. **No sample, image, label or checksum changed**; the images are
byte-identical to 1.0.0 and regenerate identically from the same script.

This is recorded because the manifest's SHA-256 changed with it, and that hash
is what evidence files use to decide whether two runs measured the same
dataset. Committed evidence carrying the 1.0.0 hash was produced against
identical image data and remains directly comparable to runs against 1.0.1 -
the only difference between the two manifests is a URL string in the metadata.

**1.0.0** - initial.
