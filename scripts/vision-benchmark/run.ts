import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  FileVisionEvidenceStore,
  runVisionBenchmarkRequest,
  VISION_BENCHMARK_PROMPT,
  VISION_PROMPT_VERSION,
  VISION_WORKLOAD_ID,
} from '../../src/modules/vision-benchmark';

type ProviderName = 'ollama' | 'gemini' | 'groq';

function readArgument(name: string): string | null {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) =>
    value.startsWith(prefix)
  );

  return argument ? argument.slice(prefix.length) : null;
}

function readProvider(): ProviderName {
  const provider = readArgument('provider');

  if (provider !== 'ollama' && provider !== 'gemini' && provider !== 'groq') {
    throw new Error(
      "Use '--provider=ollama', '--provider=gemini' or '--provider=groq'."
    );
  }

  return provider;
}

function readGitCommit(repositoryRoot: string): string {
  const override = process.env.VISION_GIT_COMMIT_SHA;

  if (override) {
    return override;
  }

  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const provider = readProvider();
  // No silent default. This script is run with `node --import tsx`, which does
  // NOT load .env - so OLLAMA_VISION_MODEL set there was never visible here,
  // and the old fallback quietly benchmarked 'gemma4' whether or not it was
  // installed. Twenty-one failed requests then look like a bad model rather
  // than a missing one.
  const defaultModel =
    provider === 'ollama'
      ? process.env.OLLAMA_VISION_MODEL
      : process.env.GEMINI_VISION_MODEL;
  const model = readArgument('model') ?? defaultModel;

  if (!model) {
    throw new Error(
      `No model given. Pass --model=<tag> exactly as the runtime reports it, ` +
        `for example --model=llava:latest. ` +
        `Check what is installed with: curl http://localhost:11434/api/tags`
    );
  }
  const deviceProfileId =
    readArgument('device') ??
    process.env.VISION_DEVICE_PROFILE_ID ??
    'local-workstation';

  const evidence = await runVisionBenchmarkRequest(
    {
      workloadId: VISION_WORKLOAD_ID,
      provider,
      model,
      deviceProfileId,
      gitCommitSha: readGitCommit(repositoryRoot),
      promptVersion: VISION_PROMPT_VERSION,
      prompt: VISION_BENCHMARK_PROMPT,
    },
    {
      repositoryRoot,
    }
  );

  const store = new FileVisionEvidenceStore(
    path.join(repositoryRoot, 'evidence', 'vision-benchmark')
  );
  const evidencePath = await store.save(evidence);

  process.stdout.write(
    `${JSON.stringify(
      {
        evidencePath: path.relative(repositoryRoot, evidencePath),
        provider: evidence.provider,
        model: evidence.model,
        passed: evidence.passed,
        metrics: evidence.metrics,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown benchmark error';
  process.stderr.write(`Vision benchmark failed: ${message}\n`);
  process.exitCode = 1;
});
