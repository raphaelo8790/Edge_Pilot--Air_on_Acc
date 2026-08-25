import { GroqProvider } from '@/modules/benchmark/infrastructure/providers/GroqProvider';
import { decodeFailure } from '@/modules/benchmark/infrastructure/providers/errors';
import {
  errorResponse,
  fetchReturning,
  fetchThatHangs,
  sseResponse,
  steppedClock,
} from './helpers';

function provider(fetchImplementation: ReturnType<typeof fetchReturning>) {
  return new GroqProvider({
    apiKey: 'gsk_test',
    fetchImplementation,
    clock: steppedClock(10),
    timeoutMs: 1000,
  });
}

/**
 * The first chunk of an OpenAI-shaped stream carries only the role. If TTFT
 * were taken on the first chunk rather than the first chunk with content, this
 * fixture would silently report a TTFT one step too early.
 */
const SUCCESSFUL_STREAM = [
  { choices: [{ delta: { role: 'assistant' } }] },
  { choices: [{ delta: { content: 'Hello' } }] },
  { choices: [{ delta: { content: ' world' } }] },
  {
    choices: [{ delta: {} }],
    // completion_time is SECONDS. 0.4 s for 40 tokens is 100 tokens/second.
    x_groq: { usage: { prompt_tokens: 6, completion_tokens: 40, completion_time: 0.4 } },
  },
];

describe('GroqProvider — the normal path', () => {
  it('takes TTFT on the first chunk that carries content, not the role chunk', async () => {
    const fetchImplementation = fetchReturning(() =>
      sseResponse(SUCCESSFUL_STREAM)
    );

    const [measured] = await provider(fetchImplementation).measure(
      'hi',
      'llama-3.1-8b-instant',
      1
    );

    expect(measured.success).toBe(true);
    expect(measured.text).toBe('Hello world');
    expect(measured.ttft_ms).toBe(10);
    expect(measured.latency_ms).toBe(20);
  });

  it('prefers the provider-reported generation time as the throughput denominator', async () => {
    const fetchImplementation = fetchReturning(() =>
      sseResponse(SUCCESSFUL_STREAM)
    );

    const [measured] = await provider(fetchImplementation).measure(
      'hi',
      'llama-3.1-8b-instant',
      1
    );

    // 40 tokens / 400 ms of server-side generation, not / 20 ms of wall clock.
    // completion_time excludes queueing, so it is the honest denominator.
    expect(measured.usage.providerReportedDurationMs).toBe(400);
    expect(measured.tokens_per_second).toBe(100);
    expect(measured.usage.outputTokens).toBe(40);
    expect(measured.usage.inputTokens).toBe(6);
  });

  it('asks for usage explicitly, because a streamed response omits it otherwise', async () => {
    const fetchImplementation = fetchReturning(() =>
      sseResponse(SUCCESSFUL_STREAM)
    );

    await provider(fetchImplementation).generate('hi', 'llama-3.1-8b-instant');

    const [call] = fetchImplementation.calls;
    const headers = call.init?.headers as Record<string, string>;

    expect(call.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer gsk_test');
    expect(JSON.parse(String(call.init?.body))).toEqual({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('also reads usage from the top-level field', async () => {
    const fetchImplementation = fetchReturning(() =>
      sseResponse([
        { choices: [{ delta: { content: 'x' } }] },
        { choices: [], usage: { prompt_tokens: 1, completion_tokens: 9 } },
      ])
    );

    const [measured] = await provider(fetchImplementation).measure('hi', 'm', 1);

    expect(measured.usage.outputTokens).toBe(9);
  });
});

describe('GroqProvider — the failure paths', () => {
  it('never calls the API without a key', async () => {
    const fetchImplementation = fetchReturning(() => sseResponse([]));

    const instance = new GroqProvider({
      apiKey: 'your-groq-api-key',
      fetchImplementation,
      clock: steppedClock(10),
    });

    const result = await instance.generate('hi', 'm');

    expect(decodeFailure(result.error_message)?.code).toBe('not_configured');
    expect(fetchImplementation.calls).toHaveLength(0);
  });

  it('reports a rejected credential as unauthorized', async () => {
    const fetchImplementation = fetchReturning(() =>
      errorResponse(401, { error: { message: 'Invalid API Key' } })
    );

    const result = await provider(fetchImplementation).generate('hi', 'm');

    expect(decodeFailure(result.error_message)?.code).toBe('unauthorized');
  });

  it('reports a rate limit as retryable', async () => {
    const fetchImplementation = fetchReturning(() =>
      errorResponse(429, { error: { message: 'Rate limit reached' } })
    );

    const result = await provider(fetchImplementation).generate('hi', 'm');

    expect(decodeFailure(result.error_message)?.code).toBe('rate_limited');
  });

  it('times out without throwing', async () => {
    const instance = new GroqProvider({
      apiKey: 'gsk_test',
      fetchImplementation: fetchThatHangs(),
      clock: steppedClock(10),
      timeoutMs: 20,
    });

    const result = await instance.generate('hi', 'm');

    expect(decodeFailure(result.error_message)?.code).toBe('timeout');
    expect(result.tokens_per_second).toBeNull();
  });

  it('survives a truncated stream that never sends [DONE]', async () => {
    const fetchImplementation = fetchReturning(() =>
      sseResponse([{ choices: [{ delta: { content: 'partial' } }] }], false)
    );

    const result = await provider(fetchImplementation).generate('hi', 'm');

    // A truncated stream is still a completed read; what arrived is real.
    expect(result.success).toBe(true);
    expect(result.text).toBe('partial');
    expect(result.tokens_per_second).toBeNull();
  });

  it('refuses to call a 200 with no parseable content a successful iteration', async () => {
    // A proxy or gateway answering 200 with an HTML error page produces a
    // stream with no data lines. Reporting that as a success would add a
    // zero-token iteration with a real-looking latency to the reliability
    // score — a fabricated measurement, which is the one thing this module
    // must not produce.
    const fetchImplementation = fetchReturning(
      () =>
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
    );

    const [measured] = await new GroqProvider({
      apiKey: 'gsk_test',
      fetchImplementation,
      clock: steppedClock(10),
    }).measure('hi', 'm', 1);

    expect(measured.success).toBe(false);
    expect(measured.failureCode).toBe('invalid_response');
    expect(measured.tokens_per_second).toBeNull();
    // The elapsed time is still recorded: how long it took to fail is evidence.
    expect(measured.latency_ms).toBeGreaterThan(0);
  });
});

describe('GroqProvider — metadata', () => {
  it('declares a cloud deployment and the conservative privacy reading', () => {
    const metadata = new GroqProvider({ apiKey: 'gsk_test' }).describe();

    expect(metadata.type).toBe('cloud');
    expect(metadata.privacyLevel).toBe('low');
    expect(metadata.officialSource).toContain('console.groq.com');
  });
});
