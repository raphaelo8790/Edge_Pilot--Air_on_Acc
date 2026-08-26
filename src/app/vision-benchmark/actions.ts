'use server';

/**
 * Running the built-in vision dataset from the page.
 *
 * WHY THIS IS A SERVER ACTION AND NOT A FETCH FROM THE BROWSER.
 * `POST /api/v1/vision-benchmarks` is guarded by VISION_BENCHMARK_API_TOKEN,
 * which is a server secret. Calling that endpoint from client code would mean
 * shipping the token to the browser, which publishes it. A server action runs
 * on the server, so the token is never involved and never leaves.
 *
 * WHY IT IS STILL OFF BY DEFAULT. A run spends real GPU time and writes an
 * evidence file. Next.js exposes server actions as POST endpoints, so an
 * ungated one would be an open "make this machine do work" button. It is
 * enabled by VISION_BENCHMARK_IN_APP=true, the same opt-in shape
 * BENCHMARK_ALLOW_DEMO already uses in the benchmark module.
 *
 * NOTHING IS WRITTEN SERVER-SIDE. The evidence is returned to the caller and
 * kept in the visitor's browser. `evidence/vision-benchmark/` stays what it
 * has always been: the reference measurements committed with the project.
 *
 * The request is built exactly as scripts/vision-benchmark/run.ts builds it -
 * same workload id, same prompt, same prompt version. That is deliberate: two
 * runs are only comparable when those match, so a run started from the page
 * must be indistinguishable from a run started from the terminal.
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { logForSession } from '@/core/logging/sessionLogStore';
import { CLOUD_RUNS_PER_HOUR, takeCloudRun } from '@/core/quota/cloudRunQuota';

import {
  runVisionBenchmarkRequest,
  VISION_BENCHMARK_PROMPT,
  VISION_PROMPT_VERSION,
  VISION_WORKLOAD_ID,
} from '@/modules/vision-benchmark';

import type { RunBuiltInResult } from './types';


/**
 * The commit the run was taken at. Recorded on the evidence so a measurement
 * can be tied to the code that produced it. Falls back rather than throwing —
 * a copy of this project with no git history is still allowed to benchmark.
 */
function readGitCommit(repositoryRoot: string): string {
  // Explicit override first; then the value a hosted build already knows.
  // Vercel sets VERCEL_GIT_COMMIT_SHA and ships no .git folder, so without
  // this every hosted run would be stamped 0000000.
  const override =
    process.env.VISION_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;

  if (override) {
    return override;
  }

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return '0000000';
  }
}

/**
 * Every argument is passed rather than read from a header, because a server
 * action is invoked through Next's own POST endpoint, not through the typed
 * API client - nothing attaches `x-edgepilot-session` or the visitor's key
 * headers to it.
 *
 * - `provider`   which cloud vendor. Ollama is NOT accepted here: a hosted
 *   server has no Ollama, so the local run happens in the browser instead
 *   (see components/vision/builtInDataset.ts).
 * - `model`      the model id exactly as the vendor lists it.
 * - `sessionId`  the browser's own id. Optional; absent means the run is not
 *   recorded in the activity log, the same rule every route follows.
 * - `keys`       the visitor's own API keys, if they set any on /setup. Used
 *   for this call and never stored; see visitor-keys.ts.
 */
export async function runBuiltInVisionBenchmark(input: {
  provider: 'gemini' | 'groq';
  model: string;
  sessionId?: string | null;
  keys?: { gemini?: string | null; groq?: string | null };
}): Promise<RunBuiltInResult> {
  const log = logForSession(input.sessionId);
  const correlationId = randomUUID();
  const provider = input.provider === 'groq' ? 'groq' : 'gemini';
  const model = input.model;

  if ((process.env.VISION_BENCHMARK_IN_APP ?? '').trim() !== 'true') {
    return {
      ok: false,
      error:
        'Running from the page is off. Set VISION_BENCHMARK_IN_APP=true in .env ' +
        'and restart the server, or use: npm run vision:run:gemini -- --model=<id>',
    };
  }

  const tag = model.trim();

  if (!tag) {
    return {
      ok: false,
      error: 'Choose a model first.',
    };
  }

  const repositoryRoot = process.cwd();

  // The visitor's key wins for this call; the server's is the fallback. The
  // key never appears in the log or the evidence.
  const visitorGemini = (input.keys?.gemini ?? '').trim();
  const visitorGroq = (input.keys?.groq ?? '').trim();
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    ...(visitorGemini ? { GEMINI_API_KEY: visitorGemini } : {}),
    ...(visitorGroq ? { GROQ_API_KEY: visitorGroq } : {}),
  };

  const configured =
    provider === 'gemini' ? environment.GEMINI_API_KEY : environment.GROQ_API_KEY;
  const usingVisitorKey = Boolean(provider === 'gemini' ? visitorGemini : visitorGroq);

  if (!configured || configured.trim() === '') {
    return {
      ok: false,
      error:
        `${provider === 'gemini' ? 'Gemini' : 'Groq'} has no API key on this server. ` +
        'Add your own on the setup page, or ask the operator to configure one.',
    };
  }

  // The operator's key is a shared resource; the visitor's own is not.
  if (!usingVisitorKey) {
    const quota = takeCloudRun(input.sessionId);

    if (!quota.allowed) {
      const minutes = Math.ceil(quota.retryAfterSeconds / 60);
      return {
        ok: false,
        error:
          `This site allows ${CLOUD_RUNS_PER_HOUR} cloud runs an hour on its own key, and you have used them. ` +
          `Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}, or add your own API key on the setup page for unlimited runs.`,
      };
    }
  }

  log?.record(
    'info',
    'benchmark',
    `Vision benchmark requested for ${tag}`,
    {
      workload_id: VISION_WORKLOAD_ID,
      provider,
      model: tag,
      key_source: usingVisitorKey ? 'visitor' : 'server',
      dataset: 'built-in reference set',
      prompt_version: VISION_PROMPT_VERSION,
    },
    correlationId
  );

  try {
    const evidence = await runVisionBenchmarkRequest(
      {
        workloadId: VISION_WORKLOAD_ID,
        provider,
        model: tag,
        // A cloud model runs on the vendor's hardware; the profile names the
        // caller's environment, which for a hosted run is the server.
        deviceProfileId: process.env.VISION_DEVICE_PROFILE_ID ?? 'cloud-via-server',
        gitCommitSha: readGitCommit(repositoryRoot),
        promptVersion: VISION_PROMPT_VERSION,
        prompt: VISION_BENCHMARK_PROMPT,
      },
      // Cloud vendors serve requests independently, so seven at a time
      // brings 21 images inside a serverless time limit without changing
      // what is measured per request.
      { repositoryRoot, environment, cloudConcurrency: 7 }
    );

    // The scores, not the images and not the model's text. Enough to answer
    // "what did I run and what came out" from an exported log alone.
    log?.record(
      'info',
      'benchmark',
      `Vision benchmark ${evidence.passed ? 'passed' : 'failed'} for ${evidence.model}`,
      {
        model: evidence.model,
        dataset_id: evidence.datasetId,
        // The manifest digest is what makes two runs comparable: same digest,
        // same images, in the same order.
        manifest_sha256: evidence.manifestSha256,
        git_commit_sha: evidence.gitCommitSha,
        samples: evidence.metrics.totalSamples,
        exact_match_accuracy: evidence.metrics.exactMatchAccuracy,
        macro_f1: evidence.metrics.macroF1,
        invalid_output_rate: evidence.metrics.invalidOutputRate,
        successful_request_rate: evidence.metrics.successfulRequestRate,
        median_latency_ms: evidence.metrics.medianLatencyMs,
        p95_latency_ms: evidence.metrics.p95LatencyMs,
        // Null when the runtime reported nothing. Never coerced to zero: a
        // figure nobody measured must not read as a measured zero.
        median_prompt_eval_ms: evidence.metrics.medianPromptEvalMs ?? null,
        median_tokens_per_second: evidence.metrics.medianTokensPerSecond ?? null,
        model_load_ms: evidence.metrics.modelLoadMs ?? null,
        hardware_fit: evidence.hardwareFit?.state ?? null,
        thresholds: evidence.thresholds,
        passed: evidence.passed,
        limitations: evidence.limitations,
      },
      correlationId
    );

    // Deliberately NOT saved here. A run started from the page belongs to the
    // visitor, not to this project's committed evidence set, and writing it to
    // the server's disk would mix the two, show every visitor everyone else's
    // runs, and grow without bound. The caller stores it in their own browser.
    return { ok: true, evidence };
  } catch (error) {
    log?.record(
      'error',
      'benchmark',
      `Vision benchmark failed for ${tag}`,
      { model: tag, message: error instanceof Error ? error.message : 'unknown' },
      correlationId
    );

    // The most common failure by far is a model tag that is not installed, and
    // the runtime's own message says so better than anything invented here.
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
