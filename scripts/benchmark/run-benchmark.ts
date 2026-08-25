/**
 * Runs a real benchmark against a real provider and writes the measured result
 * to `evidence/benchmark/`.
 *
 *   npm run bench:run -- --provider=ollama --model=llama3.2:1b --iterations=5
 *   npm run bench:run -- --provider=groq   --model=llama-3.1-8b-instant
 *   npm run bench:run -- --provider=gemini --model=gemini-2.0-flash --json-only
 *
 * This is the ONLY script in the repository that produces measured performance
 * figures. It needs a provider that actually answers: a running Ollama, or an
 * API key in `.env`. It deliberately does not touch the database, so it can be
 * run before Prisma is set up.
 *
 * Every figure it writes carries the provenance label the adapter attached, so
 * a reader can tell a stopwatch reading from an arithmetic derivation. Nothing
 * is filled in when a provider does not report it.
 *
 * Flags
 *   --provider=<ollama|gemini|groq|demo>   default: ollama
 *   --model=<name>                         default: per provider, below
 *   --prompt=<text>                        default: the fixed prompt below
 *   --iterations=<1-100>                   default: 5
 *   --timeout=<ms>                         default: BENCHMARK_TIMEOUT_MS
 *   --out=<path>                           default: evidence/benchmark/measured-<provider>-<model>.json
 *   --json-only                            print the JSON, write nothing
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { hostname, arch, cpus, platform, totalmem, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import { BenchmarkRunner } from '../../src/modules/benchmark/application/services/BenchmarkRunner';
import { ReadinessCalculator } from '../../src/modules/benchmark/core/services/ReadinessCalculator';
import { loadBenchmarkConfig } from '../../src/modules/benchmark/infrastructure/config';
import { getProviderRegistry } from '../../src/modules/benchmark/infrastructure/providers/ProviderRegistry';

/**
 * A prompt short enough to be cheap and long enough that the model has to
 * generate more than a few tokens — a one-token answer makes throughput
 * meaningless. Fixed rather than configurable-by-default so two runs on two
 * machines are comparable.
 */
const DEFAULT_PROMPT =
  'In exactly three sentences, explain what edge AI inference is and when it is preferable to a cloud API.';

const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3.2:1b',
  gemini: 'gemini-2.0-flash',
  groq: 'llama-3.1-8b-instant',
  demo: 'demo-model',
};

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((argument) => argument.startsWith(prefix));

  if (found !== undefined) {
    return found.slice(prefix.length);
  }

  return process.argv.includes(`--${name}`) ? 'true' : undefined;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Machine facts that make a latency number interpretable by someone else. */
function environmentSnapshot(): Record<string, unknown> {
  const cores = cpus();

  return {
    hostname: hostname(),
    platform: platform(),
    os_release: release(),
    architecture: arch(),
    cpu_model: cores[0]?.model ?? 'unknown',
    cpu_cores: cores.length,
    total_memory_gb: Number((totalmem() / 1024 ** 3).toFixed(2)),
    node_version: process.version,
    // Not detected: whether inference used a GPU. Docker Compose runs Ollama on
    // CPU unless the NVIDIA block is uncommented, and a CPU figure and a GPU
    // figure are not comparable. Say which one this was in the PR.
    accelerator: 'NOT DETECTED — record manually whether this run used a GPU',
    captured_at: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const providerName = flag('provider') ?? 'ollama';
  const model = flag('model') ?? DEFAULT_MODELS[providerName] ?? 'llama3.2:1b';
  const prompt = flag('prompt') ?? DEFAULT_PROMPT;
  const iterations = positiveInteger(flag('iterations'), 5);
  const jsonOnly = flag('json-only') === 'true';

  const timeoutOverride = flag('timeout');
  const config = loadBenchmarkConfig({
    ...process.env,
    ...(timeoutOverride ? { BENCHMARK_TIMEOUT_MS: timeoutOverride } : {}),
  });

  for (const warning of config.warnings) {
    console.warn(`[config] ${warning}`);
  }

  const registry = getProviderRegistry(config);

  if (!registry.has(providerName)) {
    console.error(
      `Unknown provider "${providerName}". Registered: ${registry.names().join(', ')}.\n` +
        'The demo adapter needs BENCHMARK_ALLOW_DEMO="true".'
    );
    process.exitCode = 1;
    return;
  }

  const availability = registry
    .availability()
    .find((entry) => entry.name === providerName);

  if (availability && !availability.isConfigured) {
    console.error(
      `Provider "${providerName}" is not configured: ${availability.reason}\n` +
        'See docs/local-model-setup.md.'
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Running ${iterations} iteration(s) of ${model} on ${providerName} ` +
      `(timeout ${config.timeoutMs} ms per iteration)...`
  );

  const outcome = await new BenchmarkRunner(
    registry,
    new ReadinessCalculator()
  ).run({ provider: providerName, model, prompt, iterations });

  const document = {
    artefact: 'measured benchmark run',
    generated_by: `npm run bench:run -- --provider=${providerName} --model=${model} --iterations=${iterations}`,
    what_this_proves:
      'Latency, time-to-first-token and token throughput as observed from this machine against this provider, on this date. Each field carries a provenance label.',
    what_this_does_not_prove:
      'Nothing about output quality, and nothing about cost — neither is measured. Latency includes network transit and is specific to this machine and connection.',
    environment: environmentSnapshot(),
    request: { provider: providerName, model, prompt, iterations },
    requested_provider: outcome.requestedProvider,
    effective_provider: outcome.effectiveProvider,
    fallback_used: outcome.fallbackUsed,
    fallback_chain: outcome.fallbackChain,
    simulated: outcome.simulated,
    summary: outcome.summary,
    iterations_detail: outcome.results,
    readiness_score: outcome.readinessScore,
    readiness_breakdown: outcome.readinessBreakdown,
    recommendation: outcome.recommendation,
    evidence: outcome.evidence,
    assumptions: outcome.assumptions,
    limitations: outcome.limitations,
    terminal_error_code: outcome.terminalErrorCode,
  };

  const serialised = `${JSON.stringify(document, null, 2)}\n`;

  if (jsonOnly) {
    console.log(serialised);
  } else {
    const output = resolve(
      process.cwd(),
      flag('out') ??
        `evidence/benchmark/measured-${providerName}-${model.replace(/[^a-z0-9.-]+/gi, '_')}.json`
    );

    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serialised, 'utf8');

    console.log(`\nWrote ${output}`);
  }

  console.log(
    [
      '',
      `  effective provider : ${outcome.effectiveProvider ?? 'NONE — every provider failed'}`,
      `  iterations         : ${outcome.summary.iterations_succeeded}/${outcome.summary.iterations_run} succeeded`,
      `  latency mean       : ${format(outcome.summary.latency_ms_mean, 'ms')}`,
      `  latency p50        : ${format(outcome.summary.latency_ms_p50, 'ms')}`,
      `  TTFT mean          : ${format(outcome.summary.ttft_ms_mean, 'ms')}`,
      `  throughput mean    : ${format(outcome.summary.tokens_per_second_mean, 'tok/s')}`,
      `  readiness          : ${outcome.readinessScore ?? 'not scored'}`,
      '',
      `  ${outcome.recommendation}`,
      '',
    ].join('\n')
  );

  if (outcome.effectiveProvider === null) {
    process.exitCode = 1;
  }
}

function format(value: number | null, unit: string): string {
  return value === null ? 'not reported' : `${value} ${unit}`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
