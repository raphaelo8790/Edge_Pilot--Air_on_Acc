/**
 * Shared behaviour for every benchmark adapter.
 *
 * Subclasses implement exactly one thing: how to stream one generation out of
 * one provider (`streamOnce`). Timing, timeout enforcement, error
 * classification, iteration and the narrowing to the shared `BenchmarkResult`
 * shape all happen here, so the four adapters cannot drift apart in how they
 * measure or how they fail.
 *
 * Nothing in this file throws across the module boundary. A failed iteration
 * is still a measurement — the reliability score is computed from how many
 * iterations succeeded, so swallowing a failure would inflate it.
 */

import type {
  AIResponse,
  BenchmarkResult,
} from '@/modules/benchmark/core/ports/AIProvider';
import {
  classifyTransportError,
  encodeFailure,
  type ProviderFailure,
} from './errors';
import {
  systemMillisecondClock,
  tokensPerSecond,
  type BenchmarkFetch,
  type MillisecondClock,
} from './http';
import {
  emptyUsage,
  type MeasuredAIProvider,
  type MeasuredResponse,
  type MeasurementProvenance,
  type ProviderMetadata,
  type ProviderUsage,
} from './types';

export interface ProviderAdapterOptions {
  /** Injected so adapters are testable without a network. */
  fetchImplementation?: BenchmarkFetch;
  /** Injected so adapters are testable without a real timer. */
  clock?: MillisecondClock;
  /** Per-request budget in milliseconds. */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 60000;

/**
 * What a subclass reports after streaming one generation.
 *
 * `ttftMs` is the elapsed time at the moment the first token of *content*
 * arrived — not the first byte of the response, and not the first chunk,
 * which for several providers carries only a role or a preamble.
 */
export interface StreamOutcome {
  text: string;
  ttftMs: number | null;
  usage: ProviderUsage;
}

function provenanceFor(
  outcome: StreamOutcome,
  throughput: number | null
): MeasurementProvenance {
  return {
    latencyMs: 'measured',
    ttftMs: outcome.ttftMs === null ? 'unavailable' : 'measured',
    tokensPerSecond: throughput === null ? 'unavailable' : 'derived',
    outputTokens:
      outcome.usage.outputTokens === null ? 'unavailable' : 'measured',
  };
}

export abstract class BaseProvider implements MeasuredAIProvider {
  public abstract readonly name: string;
  public abstract readonly type: 'local' | 'cloud';

  protected readonly fetchImplementation: BenchmarkFetch;
  protected readonly clock: MillisecondClock;
  protected readonly timeoutMs: number;

  constructor(options: ProviderAdapterOptions = {}) {
    // Bound to globalThis: an unbound `fetch` reference throws "Illegal
    // invocation" in some runtimes.
    this.fetchImplementation =
      options.fetchImplementation ??
      ((input, init) => globalThis.fetch(input as RequestInfo, init));
    this.clock = options.clock ?? systemMillisecondClock;
    this.timeoutMs =
      typeof options.timeoutMs === 'number' && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_TIMEOUT_MS;
  }

  public abstract describe(): ProviderMetadata;

  public abstract isConfigured(): boolean;

  /**
   * Streams one generation. Implementations may throw; `generate` catches and
   * classifies. `signal` is already wired to the timeout.
   */
  protected abstract streamOnce(
    prompt: string,
    model: string,
    signal: AbortSignal,
    startedAt: number
  ): Promise<StreamOutcome>;

  /**
   * Reason a `not_configured` refusal, so the message names the missing
   * variable instead of saying "not configured".
   */
  protected abstract configurationHint(): string;

  public async generate(prompt: string, model: string): Promise<AIResponse> {
    const measured = await this.measureOnce(prompt, model);
    return {
      text: measured.text,
      latency_ms: measured.latency_ms,
      tokens_per_second: measured.tokens_per_second,
      ttft_ms: measured.ttft_ms,
      success: measured.success,
      error_message: measured.error_message,
    };
  }

  public async measure(
    prompt: string,
    model: string,
    iterations: number
  ): Promise<MeasuredResponse[]> {
    const results: MeasuredResponse[] = [];

    // Sequential on purpose. Running iterations concurrently would have them
    // contend for the same GPU and the latency figures would measure queueing
    // rather than inference.
    for (let index = 0; index < iterations; index += 1) {
      results.push(await this.measureOnce(prompt, model));
    }

    return results;
  }

  public async benchmark(
    prompt: string,
    model: string,
    iterations: number
  ): Promise<BenchmarkResult[]> {
    const measured = await this.measure(prompt, model, iterations);

    return measured.map((result, index) => ({
      iteration: index + 1,
      latency_ms: result.latency_ms,
      tokens_per_second: result.tokens_per_second,
      ttft_ms: result.ttft_ms,
      success: result.success,
      error_message: result.error_message,
    }));
  }

  protected async measureOnce(
    prompt: string,
    model: string
  ): Promise<MeasuredResponse> {
    if (!this.isConfigured()) {
      return this.failure(
        { code: 'not_configured', message: this.configurationHint() },
        0
      );
    }

    const controller = new AbortController();
    // Not AbortSignal.timeout(): the repository targets es5 and the vision
    // module already standardised on the controller + setTimeout pair.
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    const startedAt = this.clock();

    try {
      const outcome = await this.streamOnce(
        prompt,
        model,
        controller.signal,
        startedAt
      );
      const latencyMs = round(this.clock() - startedAt);

      // A 200 that yielded nothing recognisable is NOT a successful iteration.
      //
      // This happens in practice: a corporate proxy, a load balancer or a
      // gateway answers 200 with an HTML error page, the SSE/NDJSON parser
      // finds no data lines, and the adapter would otherwise report a
      // "successful" generation with empty text, no tokens and a real-looking
      // latency. That single number is worse than an error — it raises the
      // reliability score and puts a stopwatch reading next to a request that
      // produced nothing.
      //
      // The three conditions together are what make this safe: a genuinely
      // empty completion from a well-formed stream still reports usage
      // (outputTokens is 0, not null) or a TTFT, so it does not trip this.
      // Found by the failure-mode evidence capture, not by a test.
      if (
        outcome.text.length === 0 &&
        outcome.usage.outputTokens === null &&
        outcome.ttftMs === null
      ) {
        return this.failure(
          {
            code: 'invalid_response',
            message:
              'The provider returned a success status but no parseable content, token count or ' +
              'first-token signal. Treated as a provider fault rather than as a zero-token measurement.',
          },
          latencyMs
        );
      }

      // Prefer the provider's own generation time when it reports one: it
      // excludes queueing and transport, so it is the honest denominator for
      // throughput. Wall clock is the fallback, and is still measured.
      const throughputWindow =
        outcome.usage.providerReportedDurationMs ?? latencyMs;

      const throughput = tokensPerSecond(
        outcome.usage.outputTokens,
        throughputWindow
      );

      return {
        text: outcome.text,
        latency_ms: latencyMs,
        tokens_per_second: throughput,
        ttft_ms: outcome.ttftMs === null ? null : round(outcome.ttftMs),
        success: true,
        error_message: null,
        usage: outcome.usage,
        provenance: provenanceFor(outcome, throughput),
        failureCode: null,
      };
    } catch (error) {
      const failure =
        isProviderFailure(error) ??
        classifyTransportError(error, { local: this.type === 'local' });

      return this.failure(failure, round(this.clock() - startedAt));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * A failed iteration. The elapsed time is still recorded and still
   * `measured` — how long a provider took to fail is evidence, and a timeout's
   * latency is the timeout budget itself.
   */
  protected failure(
    failure: ProviderFailure,
    latencyMs: number
  ): MeasuredResponse {
    return {
      text: '',
      latency_ms: latencyMs,
      tokens_per_second: null,
      ttft_ms: null,
      success: false,
      error_message: encodeFailure(failure),
      usage: emptyUsage(),
      provenance: {
        latencyMs: 'measured',
        ttftMs: 'unavailable',
        tokensPerSecond: 'unavailable',
        outputTokens: 'unavailable',
      },
      failureCode: failure.code,
    };
  }
}

/**
 * A subclass signals a classified failure by throwing this, rather than
 * returning a sentinel — it keeps the happy path in `streamOnce` linear.
 *
 * The brand is not decoration. This repository compiles with `target: es5`,
 * where `extends Error` is downlevelled in a way that breaks the prototype
 * chain, so `error instanceof ProviderFailureError` is false at runtime even
 * for an instance we just threw. That silently re-classified every classified
 * failure as a generic `provider_error`; the unit test for an unknown model is
 * what caught it. `setPrototypeOf` repairs the chain where the runtime allows
 * it, and the brand check below is what the code actually relies on.
 */
export const PROVIDER_FAILURE_BRAND = '__edgepilotProviderFailure' as const;

export class ProviderFailureError extends Error {
  public readonly failure: ProviderFailure;

  public readonly [PROVIDER_FAILURE_BRAND] = true;

  constructor(failure: ProviderFailure) {
    super(encodeFailure(failure));
    Object.setPrototypeOf(this, ProviderFailureError.prototype);
    this.name = 'ProviderFailureError';
    this.failure = failure;
  }
}

export function isProviderFailureError(
  error: unknown
): error is ProviderFailureError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<string, unknown>)[PROVIDER_FAILURE_BRAND] === true
  );
}

function isProviderFailure(error: unknown): ProviderFailure | null {
  return isProviderFailureError(error) ? error.failure : null;
}

export function round(value: number): number {
  return Number(value.toFixed(3));
}
