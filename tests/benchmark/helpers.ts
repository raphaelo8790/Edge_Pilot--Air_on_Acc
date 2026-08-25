/**
 * Test doubles for the benchmark provider layer.
 *
 * Every adapter takes its `fetch` and its clock by injection, so nothing in
 * these tests touches a network, a real timer, or a real model. That is what
 * makes the suite deterministic — a benchmark test that depended on real
 * latency would be a flaky test that also proved nothing.
 */

import type { ProviderRegistry } from '@/modules/benchmark/infrastructure/providers/ProviderRegistry';
import type {
  BenchmarkFetch,
  MillisecondClock,
} from '@/modules/benchmark/infrastructure/providers/http';
import type { ProviderErrorCode } from '@/modules/benchmark/infrastructure/providers/errors';
import { encodeFailure } from '@/modules/benchmark/infrastructure/providers/errors';
import {
  emptyUsage,
  type MeasuredAIProvider,
  type MeasuredResponse,
  type ProviderMetadata,
} from '@/modules/benchmark/infrastructure/providers/types';

/**
 * A clock that advances by a fixed step on every read.
 *
 * The adapters read the clock at known points (start, first token, end), so a
 * fixed step makes the resulting latency and TTFT exact integers that a test
 * can assert on rather than approximate.
 */
export function steppedClock(stepMs = 10, startMs = 0): MillisecondClock {
  let current = startMs - stepMs;

  return () => {
    current += stepMs;
    return current;
  };
}

/** A clock frozen at one value, for tests that do not care about duration. */
export function frozenClock(value = 0): MillisecondClock {
  return () => value;
}

/** Builds a streaming Response body from a list of already-encoded chunks. */
export function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** An OK response whose body streams the given newline-delimited JSON lines. */
export function ndjsonResponse(lines: object[]): Response {
  return new Response(
    streamOf(lines.map((line) => `${JSON.stringify(line)}\n`)),
    { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }
  );
}

/** An OK response whose body streams the given objects as SSE `data:` events. */
export function sseResponse(events: object[], terminate = true): Response {
  const lines = events.map((event) => `data: ${JSON.stringify(event)}\n\n`);

  if (terminate) {
    lines.push('data: [DONE]\n\n');
  }

  return new Response(streamOf(lines), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

export function errorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fetch that always returns the same response, and records its calls. */
export function fetchReturning(
  response: Response | (() => Response)
): BenchmarkFetch & { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const implementation = (async (input, init) => {
    calls.push({ url: String(input), init });
    return typeof response === 'function' ? response() : response;
  }) as BenchmarkFetch & {
    calls: Array<{ url: string; init?: RequestInit }>;
  };

  implementation.calls = calls;

  return implementation;
}

/**
 * A fetch that never resolves until the request is aborted, then rejects with
 * an AbortError — which is exactly how the platform `fetch` behaves on abort.
 * This is how the timeout path is tested without waiting for a real timeout.
 */
export function fetchThatHangs(): BenchmarkFetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;

      if (!signal) {
        return;
      }

      if (signal.aborted) {
        reject(abortError());
        return;
      }

      signal.addEventListener('abort', () => reject(abortError()));
    });
}

export function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/** A fetch that rejects the way Node does when nothing is listening. */
export function fetchConnectionRefused(): BenchmarkFetch {
  return () => {
    const error = new TypeError('fetch failed');
    (error as { cause?: { code: string } }).cause = { code: 'ECONNREFUSED' };
    return Promise.reject(error);
  };
}

// ---------------------------------------------------------------------------
// Doubles for the layers above the adapters.
//
// The runner is tested against scripted providers rather than against real
// adapters with a fake fetch. Its job is the fallback decision, and a scripted
// provider states the failure code directly instead of encoding it in an HTTP
// response that a second layer then has to classify.
// ---------------------------------------------------------------------------

export function successfulMeasurement(
  overrides: Partial<MeasuredResponse> = {}
): MeasuredResponse {
  return {
    text: 'ok',
    latency_ms: 100,
    tokens_per_second: 50,
    ttft_ms: 20,
    success: true,
    error_message: null,
    usage: {
      inputTokens: 5,
      outputTokens: 25,
      providerReportedDurationMs: 500,
    },
    provenance: {
      latencyMs: 'measured',
      ttftMs: 'measured',
      tokensPerSecond: 'derived',
      outputTokens: 'measured',
    },
    failureCode: null,
    ...overrides,
  };
}

export function failedMeasurement(
  code: ProviderErrorCode,
  message = 'scripted failure'
): MeasuredResponse {
  return {
    text: '',
    latency_ms: 10,
    tokens_per_second: null,
    ttft_ms: null,
    success: false,
    error_message: encodeFailure({ code, message }),
    usage: emptyUsage(),
    provenance: {
      latencyMs: 'measured',
      ttftMs: 'unavailable',
      tokensPerSecond: 'unavailable',
      outputTokens: 'unavailable',
    },
    failureCode: code,
  };
}

export interface FakeProvider extends MeasuredAIProvider {
  /** How many times the runner asked this provider to measure. */
  calls: number;
}

export function fakeProvider(
  name: string,
  script: MeasuredResponse | (() => MeasuredResponse),
  metadata: Partial<ProviderMetadata> = {}
): FakeProvider {
  const produce = typeof script === 'function' ? script : () => script;

  const provider: FakeProvider = {
    name,
    type: metadata.type ?? 'local',
    calls: 0,

    describe(): ProviderMetadata {
      return {
        name,
        type: metadata.type ?? 'local',
        displayName: metadata.displayName ?? name,
        baseUrl: metadata.baseUrl ?? null,
        privacyLevel: metadata.privacyLevel ?? 'high',
        reports: metadata.reports ?? { ttft: true, outputTokens: true },
        officialSource: metadata.officialSource ?? 'test double',
      };
    },

    isConfigured() {
      return true;
    },

    async measure(_prompt, _model, iterations) {
      provider.calls += 1;

      const results: MeasuredResponse[] = [];

      for (let index = 0; index < iterations; index += 1) {
        results.push(produce());
      }

      return results;
    },

    async generate(prompt, model) {
      const [measured] = await provider.measure(prompt, model, 1);
      return measured;
    },

    async benchmark(prompt, model, iterations) {
      const measured = await provider.measure(prompt, model, iterations);

      return measured.map((result, index) => ({
        iteration: index + 1,
        latency_ms: result.latency_ms,
        tokens_per_second: result.tokens_per_second,
        ttft_ms: result.ttft_ms,
        success: result.success,
        error_message: result.error_message,
      }));
    },
  };

  return provider;
}

/**
 * A registry stub exposing only what the runner uses. Cast rather than
 * subclassed so the stub does not have to build four real adapters.
 */
export function stubRegistry(chain: MeasuredAIProvider[]): ProviderRegistry {
  const known = new Set(chain.map((provider) => provider.name));

  return {
    has: (name: string) => known.has(name),
    chainFor: () => chain,
    get: (name: string) =>
      chain.filter((provider) => provider.name === name)[0] ?? null,
    names: () => chain.map((provider) => provider.name),
    availability: () => [],
  } as unknown as ProviderRegistry;
}
