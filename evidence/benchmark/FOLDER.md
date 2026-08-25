# `evidence/benchmark/` - measured provider runs

**Work package:** benchmark and provider layer.

## What this folder is

What actually happened when this application talked to a real model, and what
it did when things went wrong.

## What happened here

Nothing in this folder was regenerated during the changes described in
`00-PROJECT-RECORD.md`, and that is worth stating plainly rather than quietly
fixing: **`measured-ollama-llama3.2_latest.json` predates the hardware-fit and
privacy work.** It still records `"hardwareFit": 50` - the constant every device
received - and `"privacyScore": 100` from the era when privacy was averaged
into readiness. Read as a historical record it is accurate. Read as a
description of current behaviour it is wrong, and re-running
`npm run bench:run` would replace it.

## Files

| File | What it is |
|---|---|
| `measured-ollama-llama3.2_latest.json` | A real 5-iteration Ollama run: 100% success, mean latency 2,758.9 ms, p50 1,542.1 ms, mean TTFT 1,305.3 ms, 91.3 tokens/s, 623 output tokens. Carries the full environment block - CPU, cores, memory, accelerator - so the figures can be read in context |
| `measured-ollama-llama3.2_latest.5iter-backup.json` | The prior capture of the same run, kept for comparison |
| `failure-modes.json` | Timeout, fallback and error-classification behaviour driven through the real adapters and the real runner. Records whether every scenario behaved as documented, and lists mismatches if not |
| `clean-start.log` | The clean-environment setup sequence with real commands, real exit codes and real output. Explicitly un-ignored in `.gitignore`, because the blanket `*.log` rule would otherwise have swallowed a deliverable |

## Connected folders

- [`scripts/benchmark/`](../../scripts/benchmark/FOLDER.md) - `run-benchmark.ts`,
  `capture-failure-evidence.ts` and `capture-clean-start.ts` write these three.
- [`src/modules/benchmark/`](../../src/modules/benchmark/FOLDER.md) - the code
  being measured.
- [`src/app/evidence/`](../../src/app/evidence/FOLDER.md) - renders them.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`docs/benchmark/`](../../docs/benchmark/FOLDER.md)
- [`evidence/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
