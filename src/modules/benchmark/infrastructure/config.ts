/**
 * Server-side configuration for the benchmark layer.
 *
 * Two jobs:
 *   1. Read and validate the environment once, with documented defaults, so a
 *      misconfiguration surfaces as a named variable rather than a stack
 *      trace three layers down.
 *   2. Refuse to run in a browser bundle. Every value here is a secret or a
 *      host that must stay on the server.
 *
 * The `server-only` package is not a dependency of this repository, so the
 * guard is a runtime check rather than a build-time one. It is still worth
 * having: it turns an accidental client import into an immediate, explicit
 * failure at the point of the mistake.
 */

import { z } from 'zod';

export const BENCHMARK_ENV_KEYS = [
  'OLLAMA_HOST',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'BENCHMARK_TIMEOUT_MS',
  'BENCHMARK_FALLBACK_ORDER',
  'BENCHMARK_ALLOW_DEMO',
] as const;

/**
 * Throws if this module is reached from a browser bundle.
 *
 * Do not soften this into a warning. An API key that reaches a client bundle
 * is published, and no later fix un-publishes it.
 */
export function assertServerSide(context: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      `${context} is server-only and must never be imported into a client component. ` +
        'Provider credentials would be inlined into the browser bundle.'
    );
  }
}

const DEFAULT_TIMEOUT_MS = 60000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 600000;

const TimeoutSchema = z.coerce
  .number()
  .int()
  .min(MIN_TIMEOUT_MS)
  .max(MAX_TIMEOUT_MS);

export interface BenchmarkConfig {
  ollamaHost: string;
  geminiApiKey: string;
  groqApiKey: string;
  timeoutMs: number;
  /**
   * Provider slugs tried in order when the requested one fails with a
   * retryable error. The requested provider is always first, whatever this
   * says.
   */
  fallbackOrder: string[];
  /**
   * Whether the simulated demo adapter may be registered. Off unless asked
   * for, so a real deployment cannot silently answer with fake numbers.
   */
  allowDemo: boolean;
  /** Variables that were read but were not usable, for the docs and the API. */
  warnings: string[];
}

const DEFAULT_FALLBACK_ORDER = ['ollama', 'groq', 'gemini'];

/**
 * What this function needs from an environment: string values by name, some of
 * which may be absent.
 *
 * Deliberately NOT `NodeJS.ProcessEnv`. Next.js augments that interface with a
 * REQUIRED `NODE_ENV`, so a test cannot hand over `{ BENCHMARK_TIMEOUT_MS: '5' }`
 * without an `as unknown as` cast — and a cast that loud in nine places is a
 * type hole waiting to swallow a real mistake. `process.env` satisfies this
 * type structurally, so the production call site is unchanged.
 */
export type BenchmarkEnvironment = Readonly<Record<string, string | undefined>>;

export function loadBenchmarkConfig(
  environment: BenchmarkEnvironment = process.env
): BenchmarkConfig {
  assertServerSide('loadBenchmarkConfig');

  const warnings: string[] = [];

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const rawTimeout = environment.BENCHMARK_TIMEOUT_MS;

  if (typeof rawTimeout === 'string' && rawTimeout.trim().length > 0) {
    const parsed = TimeoutSchema.safeParse(rawTimeout);

    if (parsed.success) {
      timeoutMs = parsed.data;
    } else {
      warnings.push(
        `BENCHMARK_TIMEOUT_MS="${rawTimeout}" is not an integer between ` +
          `${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}; using ${DEFAULT_TIMEOUT_MS}.`
      );
    }
  }

  let fallbackOrder = DEFAULT_FALLBACK_ORDER;
  const rawOrder = environment.BENCHMARK_FALLBACK_ORDER;

  if (typeof rawOrder === 'string' && rawOrder.trim().length > 0) {
    const requested = rawOrder
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);

    const unknown = requested.filter(
      (entry) => DEFAULT_FALLBACK_ORDER.indexOf(entry) === -1
    );

    if (requested.length === 0 || unknown.length > 0) {
      warnings.push(
        `BENCHMARK_FALLBACK_ORDER="${rawOrder}" names unknown providers ` +
          `(${unknown.join(', ') || 'none listed'}); using the default order.`
      );
    } else {
      fallbackOrder = requested;
    }
  }

  return {
    ollamaHost: (environment.OLLAMA_HOST ?? 'http://localhost:11434').trim(),
    geminiApiKey: (environment.GEMINI_API_KEY ?? '').trim(),
    groqApiKey: (environment.GROQ_API_KEY ?? '').trim(),
    timeoutMs,
    fallbackOrder,
    allowDemo: (environment.BENCHMARK_ALLOW_DEMO ?? '').trim() === 'true',
    warnings,
  };
}
