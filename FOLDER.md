# `/` - project root

**Project:** EdgePilot AI, Team 15. **Work package:** shared; each config file
belongs to the work package whose tool it configures.

## What this folder is

The root holds three kinds of thing and nothing else: the documents that
explain the project to a human, the configuration that tells a tool how to
build it, and the two data files the application reads at startup. All source
lives under `src/`, all tests under `tests/`, all generated proof under
`evidence/`.

## What happened here

`00-PROJECT-RECORD.md` was added as the single history of the project. It
replaces the five separate audit documents the team's version carried at this
level (`AUDIT_REPORT.md`, `FINAL_AUDIT_REPORT.md`, `PRODUCTION_AUDIT_REPORT.md`,
`REMAINING_PRODUCTION_GAPS.md`, `TEST_DOCUMENTATION.md`), none of which was
marked superseded by the others.

Three Sentry configuration files were removed - they configured a service with
no DSN behind it. `.dockerignore` was fixed, which is what made
`docker build` succeed; `.gitignore` gained a `*.bak` rule and two documented
negation rules; `next.config.mjs` grew from 13 lines to 35 to carry the
standalone output setting the Dockerfile depends on.

## Files

| File | What it is |
|---|---|
| `00-PROJECT-RECORD.md` | Every fix, the work package it landed in, the structural comparison, and the known gaps. Read this first |
| `README.md` | The public entry point - what EdgePilot is and how a user installs it |
| `CONTRIBUTING.md` | External contribution guide |
| `AI_USAGE.md` | Required submission item: how AI assistance was used per work package, and how the result was verified. One section per work package |
| `LICENSE` | Licensing for the whole repository: this work under AGPL-3.0-or-later, and the imported baseline's MIT notice retained as that licence requires |
| `LICENSES/` | The full texts - `AGPL-3.0.txt` and `MIT.txt` |
| `package.json` | Dependencies and the 31 npm scripts. `prebuild` and `pretest` regenerate the vision fixtures, so a build and a test run both start from a known dataset |
| `package-lock.json` | Exact dependency tree. Committed so CI and a laptop install the same bytes |
| `tsconfig.json` | TypeScript configuration. Note `target: es5` - it is why spreading a `Map`, `Set` or typed array is unsafe in this codebase |
| `next.config.mjs` | Next.js configuration, including `output: 'standalone'` for the container image |
| `eslint.config.mjs` | Lint rules |
| `jest.config.cjs` | Test runner configuration |
| `postcss.config.mjs`, `tailwind.config.ts` | Styling pipeline |
| `Dockerfile` | Multi-stage container build. Proven working: 154.8 s, with `npm run build` succeeding inside the image |
| `docker-compose.yml` | Local Postgres plus the app |
| `.dockerignore` | What the build context excludes. Was the cause of the Docker build failure and is now correct |
| `.gitignore` | Includes `*.bak` and two documented exceptions - the reference llava measurement and the workloads scaffold |
| `.gitattributes` | Line-ending normalisation |
| `.env.example` | Every environment variable with a comment. The real `.env` is never committed |
| `benchmark-tasks.json` | The controlled task prompts the dashboard offers |
| `device-profile.json` | Left over from the removed device module. Referenced only by `.dockerignore` and two historical evidence files |
| `seed-local-rows.sql`, `setup-db.sh` | Local database bootstrap |

## Connected folders

- [`src/`](src/FOLDER.md) - everything `next build` compiles.
- [`prisma/`](prisma/FOLDER.md) - the schema `package.json`'s `db:*` scripts drive.
- [`docs/`](docs/FOLDER.md) - the long-form documentation this file summarises.
- [`evidence/`](evidence/FOLDER.md) - what the `bench:*`, `vision:*` and
  `eval:matrix` scripts write.
- [`scripts/`](scripts/FOLDER.md) - the implementations behind those npm scripts.
- [`.github/workflows/`](.github/workflows/FOLDER.md) - runs `lint`, `test` and
  `build` from this `package.json` on every push.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`.github/`](.github/FOLDER.md)
- [`LICENSES/`](LICENSES/FOLDER.md)
- [`docs/pdf/`](docs/pdf/FOLDER.md)
- [`scripts/db/`](scripts/db/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
