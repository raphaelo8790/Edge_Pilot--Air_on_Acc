/**
 * Captures the benchmark layer's failure behaviour to
 * `evidence/benchmark/failure-modes.json`.
 *
 *   npm run bench:evidence:failures
 *
 * WHY THIS SCRIPT EXISTS SEPARATELY FROM THE TESTS.
 * The acceptance criteria ask for evidence of timeout and fallback behaviour,
 * not just a green test run. A passing test proves the behaviour to whoever
 * runs the suite; this file is the artefact that can be read in a review
 * without running anything.
 *
 * WHAT IT DOES AND DOES NOT PROVE.
 * Every scenario here is driven through the REAL adapters and the REAL runner.
 * What is faked is only the transport: `fetch` is replaced with a function that
 * returns a scripted response, and the clock is replaced with one that steps by
 * a fixed amount on each read. So this file is honest evidence of
 * CLASSIFICATION and CONTROL FLOW — which code comes out of which condition,
 * and whether the runner falls back — and it is NOT evidence of latency,
 * throughput, or anything a real model does. The timings in it are the stepped
 * clock's, and every record says so.
 *
 * For real numbers, run `npm run bench:run` against a live provider. That
 * writes to a different file, and the two must not be confused.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { BenchmarkRunner } from '../../src/modules/benchmark/application/services/BenchmarkRunner';
import { ReadinessCalculator } from '../../src/modules/benchmark/core/services/ReadinessCalculator';
import {
  allProviderErrorCodes,
  describeProviderError,
  encodeFailure,
  type ProviderErrorCode,
} from '../../src/modules/benchmark/infrastructure/providers/errors';
import { GeminiProvider } from '../../src/modules/benchmark/infrastructure/providers/GeminiProvider';
import { GroqProvider } from '../../src/modules/benchmark/infrastructure/providers/GroqProvider';
import { OllamaProvider } from '../../src/modules/benchmark/infrastructure/providers/OllamaProvider';
import type { ProviderRegistry } from '../../src/modules/benchmark/infrastructure/providers/ProviderRegistry';
import {
  emptyUsage,
  type MeasuredAIProvider,
  type MeasuredResponse,
} from '../../src/modules/benchmark/infrastructure/providers/types';

const OUTPUT = resolve(
  process.cwd(),
  'evidence/benchmark/failure-modes.json'
);

const STEP_MS = 10;

/** A clock that advances by a fixed step on every read. */
function steppedClock(step = STEP_MS): () => number {
  let now = 0;

  return () => {
    const current = now;
    now += step;
    return current;
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ndjsonResponse(lines: unknown[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'application/x-ndjson' } }
  );
}

/** Never resolves until aborted — the only honest way to exercise a timeout. */
function fetchThatHangs(): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      });
    })) as unknown as typeof fetch;
}

function fetchReturning(response: () => Response): typeof fetch {
  return (async () => response()) as unknown as typeof fetch;
}

function fetchRefusingConnection(): typeof fetch {
  return (async () => {
    const error = new Error('fetch failed');
    (error as { cause?: { code: string } }).cause = { code: 'ECONNREFUSED' };
    throw error;
  }) as unknown as typeof fetch;
}

interface ScenarioRecord {
  scenario: string;
  provider: string;
  condition: string;
  expected_code: ProviderErrorCode;
  observed_code: string | null;
  observed_message: string | null;
  success: boolean;
  http_status_returned_by_api: number;
  runner_may_fall_back: boolean;
  matched: boolean;
}

async function providerScenarios(): Promise<ScenarioRecord[]> {
  const records: ScenarioRecord[] = [];

  async function record(
    scenario: string,
    providerName: string,
    condition: string,
    expected: ProviderErrorCode,
    run: () => Promise<MeasuredResponse>
  ): Promise<void> {
    const response = await run();
    const observed = response.failureCode;

    records.push({
      scenario,
      provider: providerName,
      condition,
      expected_code: expected,
      observed_code: observed,
      observed_message: response.error_message,
      success: response.success,
      http_status_returned_by_api: describeProviderError(expected).status,
      runner_may_fall_back: describeProviderError(expected).retryable,
      matched: observed === expected,
    });
  }

  // --- Ollama: the local runtime is not running. ----------------------------
  await record(
    'local runtime down',
    'ollama',
    'TCP connection refused on OLLAMA_HOST',
    'local_unavailable',
    async () => {
      const [first] = await new OllamaProvider({
        host: 'http://localhost:11434',
        fetchImplementation: fetchRefusingConnection(),
        clock: steppedClock(),
      }).measure('hello', 'llama3.2:1b', 1);

      return first;
    }
  );

  // --- Ollama: the model is not pulled. -------------------------------------
  await record(
    'unknown model',
    'ollama',
    'HTTP 404 with a "model not found" body',
    'invalid_model',
    async () => {
      const [first] = await new OllamaProvider({
        host: 'http://localhost:11434',
        fetchImplementation: fetchReturning(() =>
          jsonResponse(404, { error: 'model "no-such-model" not found' })
        ),
        clock: steppedClock(),
      }).measure('hello', 'no-such-model', 1);

      return first;
    }
  );

  // --- Ollama: an error arrives mid-stream, after tokens. -------------------
  await record(
    'mid-stream failure',
    'ollama',
    'NDJSON stream carries an error object after partial content',
    'provider_error',
    async () => {
      const [first] = await new OllamaProvider({
        host: 'http://localhost:11434',
        fetchImplementation: fetchReturning(() =>
          ndjsonResponse([
            { response: 'partial', done: false },
            { error: 'runner process exited unexpectedly' },
          ])
        ),
        clock: steppedClock(),
      }).measure('hello', 'llama3.2:1b', 1);

      return first;
    }
  );

  // --- Ollama: the request exceeds the per-request budget. ------------------
  await record(
    'timeout',
    'ollama',
    'no response before BENCHMARK_TIMEOUT_MS (set to 20 ms here)',
    'timeout',
    async () => {
      const [first] = await new OllamaProvider({
        host: 'http://localhost:11434',
        timeoutMs: 20,
        fetchImplementation: fetchThatHangs(),
        clock: steppedClock(),
      }).measure('hello', 'llama3.2:1b', 1);

      return first;
    }
  );

  // --- Gemini: no key configured. -------------------------------------------
  await record(
    'no credential',
    'gemini',
    'GEMINI_API_KEY unset — the adapter refuses before any network call',
    'not_configured',
    async () => {
      const [first] = await new GeminiProvider({
        apiKey: '',
        fetchImplementation: fetchReturning(() => jsonResponse(200, {})),
        clock: steppedClock(),
      }).measure('hello', 'gemini-2.0-flash', 1);

      return first;
    }
  );

  // --- Gemini: the key is rejected. -----------------------------------------
  await record(
    'rejected credential',
    'gemini',
    'HTTP 401 from the streaming endpoint',
    'unauthorized',
    async () => {
      const [first] = await new GeminiProvider({
        apiKey: 'AIza-not-a-real-key',
        fetchImplementation: fetchReturning(() =>
          jsonResponse(401, { error: { message: 'API key not valid' } })
        ),
        clock: steppedClock(),
      }).measure('hello', 'gemini-2.0-flash', 1);

      return first;
    }
  );

  // --- Groq: quota exhausted. -----------------------------------------------
  await record(
    'rate limited',
    'groq',
    'HTTP 429 from the chat completions endpoint',
    'rate_limited',
    async () => {
      const [first] = await new GroqProvider({
        apiKey: 'gsk_placeholder_for_evidence_capture',
        fetchImplementation: fetchReturning(() =>
          jsonResponse(429, { error: { message: 'Rate limit reached' } })
        ),
        clock: steppedClock(),
      }).measure('hello', 'llama-3.1-8b-instant', 1);

      return first;
    }
  );

  // --- Groq: the payload does not match the documented shape. ---------------
  await record(
    'unparseable response',
    'groq',
    'HTTP 200 whose body is not the documented SSE shape',
    'invalid_response',
    async () => {
      const [first] = await new GroqProvider({
        apiKey: 'gsk_placeholder_for_evidence_capture',
        fetchImplementation: fetchReturning(
          () =>
            new Response('<html>502 Bad Gateway</html>', {
              status: 200,
              headers: { 'content-type': 'text/html' },
            })
        ),
        clock: steppedClock(),
      }).measure('hello', 'llama-3.1-8b-instant', 1);

      return first;
    }
  );

  return records;
}

// ---------------------------------------------------------------------------
// Fallback scenarios. These use scripted providers rather than scripted HTTP,
// because the question here is what the RUNNER does with a classified failure,
// not how a failure gets classified.
// ---------------------------------------------------------------------------

function scriptedProvider(
  name: string,
  outcome: 'succeeds' | ProviderErrorCode,
  privacyLevel: 'low' | 'high' = 'high'
): MeasuredAIProvider & { calls: number } {
  const provider = {
    name,
    calls: 0,
    describe: () => ({
      name,
      type: privacyLevel === 'high' ? ('local' as const) : ('cloud' as const),
      displayName: name,
      baseUrl: null,
      privacyLevel,
      reports: { ttft: true, outputTokens: true },
      officialSource: 'scripted for evidence capture',
    }),
    isConfigured: () => true,
    async measure(
      _prompt: string,
      _model: string,
      iterations: number
    ): Promise<MeasuredResponse[]> {
      provider.calls += 1;

      const results: MeasuredResponse[] = [];

      for (let index = 0; index < iterations; index += 1) {
        results.push(
          outcome === 'succeeds'
            ? {
                latency_ms: 100,
                tokens_per_second: 50,
                ttft_ms: 20,
                success: true,
                text: 'ok',
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
              }
            : {
                latency_ms: 10,
                tokens_per_second: null,
                ttft_ms: null,
                success: false,
                text: '',
                error_message: encodeFailure({
                  code: outcome,
                  message: 'scripted for evidence capture',
                }),
                usage: emptyUsage(),
                provenance: {
                  latencyMs: 'measured',
                  ttftMs: 'unavailable',
                  tokensPerSecond: 'unavailable',
                  outputTokens: 'unavailable',
                },
                failureCode: outcome,
              }
        );
      }

      return results;
    },
    async generate() {
      throw new Error('not used');
    },
    async benchmark(prompt: string, model: string, iterations: number) {
      return provider.measure(prompt, model, iterations);
    },
  };

  return provider as unknown as MeasuredAIProvider & { calls: number };
}

function scriptedRegistry(chain: MeasuredAIProvider[]): ProviderRegistry {
  return {
    has: () => chain.length > 0,
    chainFor: () => chain,
    get: (name: string) => chain.find((p) => p.name === name) ?? null,
    names: () => chain.map((p) => p.name),
    availability: () => [],
  } as unknown as ProviderRegistry;
}

interface FallbackRecord {
  scenario: string;
  first_provider_failed_with: ProviderErrorCode;
  retryable: boolean;
  second_provider_was_called: boolean;
  effective_provider: string | null;
  chain: { provider: string; outcome: string; error_code: string | null }[];
  terminal_error_code: string | null;
  behaved_as_documented: boolean;
}

async function fallbackScenarios(): Promise<FallbackRecord[]> {
  const records: FallbackRecord[] = [];

  for (const code of allProviderErrorCodes()) {
    if (code === 'not_configured') {
      // A not-configured provider is skipped by the registry rather than
      // called, so it is not a fallback scenario. Covered above instead.
      continue;
    }

    const first = scriptedProvider('ollama', code);
    const second = scriptedProvider('groq', 'succeeds', 'low');

    const outcome = await new BenchmarkRunner(
      scriptedRegistry([first, second]),
      new ReadinessCalculator()
    ).run({
      provider: 'ollama',
      model: 'llama3.2:1b',
      prompt: 'hello',
      iterations: 3,
    });

    const retryable = describeProviderError(code).retryable;
    const secondCalled = second.calls > 0;

    records.push({
      scenario: `first provider fails with ${code}`,
      first_provider_failed_with: code,
      retryable,
      second_provider_was_called: secondCalled,
      effective_provider: outcome.effectiveProvider,
      chain: outcome.fallbackChain.map((attempt) => ({
        provider: attempt.provider,
        outcome: attempt.outcome,
        error_code: attempt.error_code,
      })),
      terminal_error_code: outcome.terminalErrorCode,
      // The whole policy in one boolean: fall back exactly when retryable.
      behaved_as_documented: secondCalled === retryable,
    });
  }

  // Partial success is not a fallback trigger — it is a reliability figure.
  const flaky = (() => {
    let call = 0;
    const succeeding = scriptedProvider('ollama', 'succeeds');
    const failing = scriptedProvider('ollama', 'timeout');

    return {
      ...succeeding,
      calls: 0,
      async measure(prompt: string, model: string, iterations: number) {
        const results = [];
        for (let index = 0; index < iterations; index += 1) {
          call += 1;
          const [one] =
            call === 2
              ? await failing.measure(prompt, model, 1)
              : await succeeding.measure(prompt, model, 1);
          results.push(one);
        }
        return results;
      },
    } as unknown as MeasuredAIProvider;
  })();

  const backup = scriptedProvider('groq', 'succeeds', 'low');

  const partial = await new BenchmarkRunner(
    scriptedRegistry([flaky, backup]),
    new ReadinessCalculator()
  ).run({
    provider: 'ollama',
    model: 'llama3.2:1b',
    prompt: 'hello',
    iterations: 3,
  });

  records.push({
    scenario: 'one iteration of three fails, the other two succeed',
    first_provider_failed_with: 'timeout',
    retryable: true,
    second_provider_was_called: backup.calls > 0,
    effective_provider: partial.effectiveProvider,
    chain: partial.fallbackChain.map((attempt) => ({
      provider: attempt.provider,
      outcome: attempt.outcome,
      error_code: attempt.error_code,
    })),
    terminal_error_code: partial.terminalErrorCode,
    // A partially working provider must be accepted and reported at its real
    // success rate, not abandoned for a different one.
    behaved_as_documented:
      backup.calls === 0 && partial.summary.iterations_succeeded === 2,
  });

  return records;
}

async function main(): Promise<void> {
  const providers = await providerScenarios();
  const fallback = await fallbackScenarios();

  const mismatched = providers
    .filter((record) => !record.matched)
    .map((record) => `${record.provider}/${record.scenario}`)
    .concat(
      fallback
        .filter((record) => !record.behaved_as_documented)
        .map((record) => record.scenario)
    );

  const document = {
    artefact: 'benchmark failure-mode evidence',
    generated_by: 'npm run bench:evidence:failures',
    what_this_proves:
      'Each documented error code is produced by the condition it describes, and the runner falls back exactly when the code is retryable.',
    what_this_does_not_prove:
      'Nothing about latency, throughput or model quality. The transport is scripted and the clock is a fixed stepper, so every duration below is an artefact of the harness, not a measurement. Real figures come from `npm run bench:run`.',
    harness: {
      transport: 'fetch replaced with scripted responses; no network call is made',
      clock: `stepped by ${STEP_MS} ms on each read`,
      providers_exercised: ['ollama', 'gemini', 'groq'],
    },
    error_code_reference: allProviderErrorCodes().map((code) => ({
      code,
      http_status: describeProviderError(code).status,
      retryable: describeProviderError(code).retryable,
      explanation: describeProviderError(code).explanation,
    })),
    provider_classification: providers,
    runner_fallback_policy: fallback,
    all_scenarios_behaved_as_documented: mismatched.length === 0,
    mismatches: mismatched,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  console.log(
    `Wrote ${OUTPUT}\n` +
      `  ${providers.length} classification scenarios, ${fallback.length} fallback scenarios.\n` +
      (mismatched.length === 0
        ? '  All behaved as documented.'
        : `  MISMATCHES: ${mismatched.join(', ')}`)
  );

  if (mismatched.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
