# `src/modules/benchmark/core/services/` - scoring and judgement

**Work package:** benchmark and provider layer.

## What this folder is

Ten files, and collectively they are the answer to "what is this application
allowed to claim". Eight of them are new.

## What happened here

Each file below records, in its own header, the thing it was written to stop.
The short version:

- A **constant** was being presented as a hardware measurement.
- A **weighted average** was mixing legal exposure with throughput.
- A **mean** was being reported as a comparison result.
- A **declared task type** was being written to the database and read by
  nothing.
- **Two local models** were about to be benchmarked concurrently on one GPU.
- A **privacy verdict** was arriving after the prompt had already left.

## Files

| File | What it is |
|---|---|
| `HardwareFitAssessor.ts` | 229 lines. Replaces `hardwareFit: 50`, a constant every device on earth received. Scores **placement** - did the model fit in GPU memory, and if not how much of it did - and deliberately **not** speed, because latency is already a readiness term and a slow CPU run would otherwise be punished twice. Reports VRAM taken and the spilled share in words, and says so when the runtime does not report card capacity |
| `ReadinessCalculator.ts` | 89 lines. Four measured performance terms. Privacy was the fifth and is gone: a coarse label mapped to 30/60/100 let a fast provider average away a data policy that should have disqualified it, and implied an arithmetic relationship between privacy levels nobody can defend |
| `PrivacyAssessor.ts` | 314 lines. Privacy as an ordinal **class**, with disqualifiers, egress classification and observed transport. Annotates or rules out a recommendation instead of nudging a number. Fails closed on a null endpoint |
| `privacy-catalogue.ts` | 97 lines. Provider data-policy facts by slug and billing tier. **Every value starts `null` and `unverified` on purpose** - these are terms-of-service facts that differ by tier and change without notice, and filling them in from memory is how an evidence-based tool starts publishing stale claims confidently |
| `egress-warning.ts` | 133 lines. Answers *before* the run: is this prompt about to leave the machine, and to whom. Pure and synchronous so any surface can use it. Reports the prompt's character count and **never carries the prompt text** - an object that warns text is about to leave must not contain a copy of it |
| `ComparisonPlanner.ts` | 141 lines. Decides whether entrants may be compared at all, and whether they may run concurrently. For two cloud providers, parallel is right. For two local models it destroys the measurement: they contend for the same GPU and the runtime may evict one for the other |
| `ComparisonReport.ts` | 506 lines. Per-dimension verdicts, each marked established or not. A mean is not a fact: if the entrants' observed ranges overlap, no winner is declared. At five iterations a 10% gap in means routinely sits inside a 3x spread |
| `ModelModality.ts` | 167 lines. Vision and embedding are identified **positively** from Ollama's `families` array; text is the residual and is always marked `inferred`, because the absence of a vision family is not proof of anything |
| `TaskCompatibility.ts` | 174 lines. Turns a declared task type into a constraint. Deliberately asymmetric - vision can do text, text cannot do vision, embedding neither. `shapeOf('code_generation')` states plainly that nothing here compiles or runs the output |
| `ComparisonEngine.ts` | 101 lines. The scaffold's original comparison helper |

## Connected folders

- [`../../application/services/`](../../application/services/FOLDER.md) - the
  runner that calls these.
- [`../../application/use-cases/`](../../application/use-cases/FOLDER.md) -
  `RunComparison`, which uses the planner and the report.
- [`../../infrastructure/`](../../infrastructure/FOLDER.md) -
  `OllamaResidencyProbe.ts` supplies the observation hardware fit scores.
- [`src/core/logging/`](../../../../core/logging/FOLDER.md) - the session log,
  which must not undo the egress warning.
- [`tests/benchmark/`](../../../../../tests/benchmark/FOLDER.md) -
  `hardware-fit`, `privacy-assessor`, `egress-warning`, `comparison`,
  `task-compatibility`.
- [`evidence/evaluation/`](../../../../../evidence/evaluation/FOLDER.md) - the
  ten-case matrix drives these directly.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`scripts/evaluation/`](../../../../../scripts/evaluation/FOLDER.md)
- [`src/app/api/v1/comparisons/`](../../../../app/api/v1/comparisons/FOLDER.md)
- [`src/app/api/v1/readiness/`](../../../../app/api/v1/readiness/FOLDER.md)
- `src/app/api/v1/readiness/[id]/` ([FOLDER.md](../../../../app/api/v1/readiness/%5Bid%5D/FOLDER.md))
- [`src/modules/benchmark/core/`](../FOLDER.md)
- [`src/modules/benchmark/core/entities/`](../entities/FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
