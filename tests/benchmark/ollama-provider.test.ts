import { OllamaProvider } from '@/modules/benchmark/infrastructure/providers/OllamaProvider';
import { decodeFailure } from '@/modules/benchmark/infrastructure/providers/errors';
import {
  errorResponse,
  fetchConnectionRefused,
  fetchReturning,
  fetchThatHangs,
  ndjsonResponse,
  steppedClock,
} from './helpers';

/**
 * The clock is read three times per iteration: at the start, at the first
 * content token, and at the end. A 10 ms step therefore produces a TTFT of
 * 10 ms and a latency of 20 ms, exactly.
 */
function provider(fetchImplementation: ReturnType<typeof fetchReturning>) {
  return new OllamaProvider({
    host: 'http://ollama.test:11434',
    fetchImplementation,
    clock: steppedClock(10),
    timeoutMs: 1000,
  });
}

const SUCCESSFUL_STREAM = [
  { response: 'Hello', done: false },
  { response: ' world', done: false },
  {
    response: '',
    done: true,
    prompt_eval_count: 7,
    eval_count: 50,
    // Nanoseconds. 500_000_000 ns = 500 ms, so 50 tokens is 100 tokens/second.
    eval_duration: 500000000,
  },
];

describe('OllamaProvider — the normal path', () => {
  it('streams, measures time to first token, and reports real token counts', async () => {
    const fetchImplementation = fetchReturning(() =>
      ndjsonResponse(SUCCESSFUL_STREAM)
    );

    const result = await provider(fetchImplementation).generate(
      'hi',
      'llama3.2:1b'
    );

    expect(result.success).toBe(true);
    expect(result.text).toBe('Hello world');
    expect(result.ttft_ms).toBe(10);
    expect(result.latency_ms).toBe(20);
    // Derived from the provider's own eval_duration, not from our wall clock.
    expect(result.tokens_per_second).toBe(100);
    expect(result.error_message).toBeNull();
  });

  it('requests a streamed generation, because TTFT cannot be measured otherwise', async () => {
    const fetchImplementation = fetchReturning(() =>
      ndjsonResponse(SUCCESSFUL_STREAM)
    );

    await provider(fetchImplementation).generate('hi', 'llama3.2:1b');

    const [call] = fetchImplementation.calls;

    expect(call.url).toBe('http://ollama.test:11434/api/generate');
    expect(JSON.parse(String(call.init?.body))).toEqual({
      model: 'llama3.2:1b',
      prompt: 'hi',
      stream: true,
    });
  });

  it('labels every reported figure with how it was obtained', async () => {
    const fetchImplementation = fetchReturning(() =>
      ndjsonResponse(SUCCESSFUL_STREAM)
    );

    const [measured] = await provider(fetchImplementation).measure(
      'hi',
      'llama3.2:1b',
      1
    );

    expect(measured.provenance).toEqual({
      latencyMs: 'measured',
      ttftMs: 'measured',
      tokensPerSecond: 'derived',
      outputTokens: 'measured',
    });
    expect(measured.usage.outputTokens).toBe(50);
    expect(measured.usage.inputTokens).toBe(7);
  });

  it('runs every requested iteration and numbers them from one', async () => {
    const fetchImplementation = fetchReturning(() =>
      ndjsonResponse(SUCCESSFUL_STREAM)
    );

    const results = await provider(fetchImplementation).benchmark(
      'hi',
      'llama3.2:1b',
      3
    );

    expect(results.map((result) => result.iteration)).toEqual([1, 2, 3]);
    expect(results.every((result) => result.success)).toBe(true);
    expect(fetchImplementation.calls).toHaveLength(3);
  });

  it('leaves throughput null when the provider reports no token count', async () => {
    const fetchImplementation = fetchReturning(() =>
      ndjsonResponse([
        { response: 'Hello', done: false },
        { response: '', done: true },
      ])
    );

    const [measured] = await provider(fetchImplementation).measure('hi', 'm', 1);

    // Not zero, and not a guess from character count.
    expect(measured.tokens_per_second).toBeNull();
    expect(measured.provenance.tokensPerSecond).toBe('unavailable');
  });
});

describe('OllamaProvider — the failure paths', () => {
  it('reports a timeout without throwing, and still records the elapsed time', async () => {
    const instance = new OllamaProvider({
      host: 'http://ollama.test:11434',
      fetchImplementation: fetchThatHangs(),
      clock: steppedClock(10),
      timeoutMs: 20,
    });

    const result = await instance.generate('hi', 'llama3.2:1b');

    expect(result.success).toBe(false);
    expect(decodeFailure(result.error_message)?.code).toBe('timeout');
    // A failed iteration is still a measurement.
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.tokens_per_second).toBeNull();
  });

  it('reports an unreachable runtime rather than a generic error', async () => {
    const instance = new OllamaProvider({
      host: 'http://ollama.test:11434',
      fetchImplementation: fetchConnectionRefused(),
      clock: steppedClock(10),
    });

    const result = await instance.generate('hi', 'llama3.2:1b');

    expect(result.success).toBe(false);
    expect(decodeFailure(result.error_message)?.code).toBe('local_unavailable');
  });

  it('reports an unknown model as a request error, not a provider fault', async () => {
    const fetchImplementation = fetchReturning(() =>
      errorResponse(404, { error: 'model "nope" not found, try pulling it' })
    );

    const result = await provider(fetchImplementation).generate('hi', 'nope');

    expect(result.success).toBe(false);
    expect(decodeFailure(result.error_message)?.code).toBe('invalid_model');
  });

  it('catches an error reported mid-stream with a 200 status', async () => {
    const fetchImplementation = fetchReturning(() =>
      ndjsonResponse([{ error: 'model requires more system memory' }])
    );

    const result = await provider(fetchImplementation).generate('hi', 'huge');

    expect(result.success).toBe(false);
    expect(result.error_message).toContain('more system memory');
  });

  it('keeps going when a single stream line is malformed', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('not json at all\n'));
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ response: 'ok', done: false })}\n`)
        );
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ done: true, eval_count: 2, eval_duration: 1000000 })}\n`
          )
        );
        controller.close();
      },
    });

    const fetchImplementation = fetchReturning(
      () => new Response(body, { status: 200 })
    );

    const result = await provider(fetchImplementation).generate('hi', 'm');

    expect(result.success).toBe(true);
    expect(result.text).toBe('ok');
  });
});

describe('OllamaProvider — metadata', () => {
  it('declares a local, private deployment and cites the streaming contract', () => {
    const metadata = new OllamaProvider({ host: 'http://x:11434' }).describe();

    expect(metadata.type).toBe('local');
    expect(metadata.privacyLevel).toBe('high');
    expect(metadata.officialSource).toContain('github.com/ollama/ollama');
  });

  it('is configured whenever it has a host — reachability is a runtime question', () => {
    expect(new OllamaProvider({ host: 'http://x:11434' }).isConfigured()).toBe(
      true
    );
    expect(new OllamaProvider({ host: '' }).isConfigured()).toBe(false);
  });
});
