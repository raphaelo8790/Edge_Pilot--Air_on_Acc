/**
 * Demo adapter — the documented substitute the acceptance criteria allow when
 * no real provider is reachable ("Ollama and at least one cloud provider work,
 * or a documented demo adapter substitutes").
 *
 * It exists so the API, the persistence layer and the dashboard can be
 * exercised end to end on a machine with no GPU, no Ollama and no API keys —
 * for example in CI, or during a demo on someone else's laptop.
 *
 * IT PRODUCES NO MEASUREMENTS. Every figure it returns is labelled
 * `simulated`, it is never registered unless explicitly enabled with
 * BENCHMARK_ALLOW_DEMO=true, and the runner marks any run that touched it so
 * the numbers can never be mistaken for evidence. Deterministic on purpose:
 * the same prompt gives the same figures, so a demo is reproducible and
 * obviously synthetic.
 */

import {
  BaseProvider,
  type ProviderAdapterOptions,
  type StreamOutcome,
} from './BaseProvider';
import { type ProviderMetadata, type ProviderUsage } from './types';

export interface DemoProviderOptions extends ProviderAdapterOptions {
  /** Simulated wall-clock cost of one iteration. */
  baseLatencyMs?: number;
  /** Simulated share of that spent before the first token. */
  ttftShare?: number;
}

/** A stable hash, so the same prompt always yields the same shape of answer. */
function stableHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}

export class DemoProvider extends BaseProvider {
  public readonly name = 'demo';
  public readonly type = 'local' as const;

  private readonly baseLatencyMs: number;
  private readonly ttftShare: number;

  constructor(options: DemoProviderOptions = {}) {
    super(options);
    this.baseLatencyMs = options.baseLatencyMs ?? 250;
    this.ttftShare = options.ttftShare ?? 0.2;
  }

  public describe(): ProviderMetadata {
    return {
      name: this.name,
      type: this.type,
      displayName: 'Demo adapter (simulated — not a measurement)',
      baseUrl: null,
      privacyLevel: 'high',
      reports: { ttft: true, outputTokens: true },
      officialSource:
        'docs/local-model-setup.md#demo-adapter — this project, not a vendor.',
    };
  }

  public isConfigured(): boolean {
    return true;
  }

  protected configurationHint(): string {
    return 'The demo adapter needs no configuration.';
  }

  protected async streamOnce(
    prompt: string,
    model: string,
    signal: AbortSignal,
    // Deliberately unused: the simulated timings are derived from the prompt
    // hash, not from the clock, so the same prompt always produces the same
    // fake numbers. The parameter stays to match the abstract signature.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startedAt: number
  ): Promise<StreamOutcome> {
    if (signal.aborted) {
      // Honour an already-aborted signal so the timeout tests behave the same
      // against this adapter as against a real one.
      const abortError = new Error('Request aborted after timeout.');
      abortError.name = 'AbortError';
      throw abortError;
    }

    const seed = stableHash(`${model}:${prompt}`);
    const outputTokens = 24 + (seed % 40);
    const totalMs = this.baseLatencyMs + (seed % 120);

    const text =
      `[simulated output from the demo adapter — not produced by a model]\n` +
      `model=${model} tokens=${outputTokens}`;

    return Promise.resolve<StreamOutcome>({
      text,
      ttftMs: Number((totalMs * this.ttftShare).toFixed(3)),
      usage: {
        inputTokens: Math.max(1, Math.round(prompt.length / 4)),
        outputTokens,
        providerReportedDurationMs: totalMs,
      } satisfies ProviderUsage,
    });
  }

  /**
   * Overridden so nothing this adapter returns can be read as `measured`.
   * The base class labels a real clock reading truthfully; here the clock
   * reading is real but the thing it timed is not.
   */
  protected async measureOnce(prompt: string, model: string) {
    const result = await super.measureOnce(prompt, model);

    return {
      ...result,
      provenance: {
        latencyMs: 'simulated' as const,
        ttftMs: 'simulated' as const,
        tokensPerSecond: 'simulated' as const,
        outputTokens: 'simulated' as const,
      },
    };
  }
}
