import {
  GeminiProvider,
  isUsableKey,
} from '@/modules/benchmark/infrastructure/providers/GeminiProvider';
import { decodeFailure } from '@/modules/benchmark/infrastructure/providers/errors';
import {
  errorResponse,
  fetchReturning,
  fetchThatHangs,
  sseResponse,
  steppedClock,
} from './helpers';

function provider(fetchImplementation: ReturnType<typeof fetchReturning>) {
  return new GeminiProvider({
    apiKey: 'test-key',
    fetchImplementation,
    clock: steppedClock(10),
    timeoutMs: 1000,
  });
}

const SUCCESSFUL_STREAM = [
  {
    candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
  },
  {
    candidates: [{ content: { parts: [{ text: ' world' }] } }],
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 12 },
  },
];

describe('GeminiProvider — the normal path', () => {
  it('streams SSE, measures TTFT, and reads the reported token counts', async () => {
    const fetchImplementation = fetchReturning(() =>
      sseResponse(SUCCESSFUL_STREAM)
    );

    const [measured] = await provider(fetchImplementation).measure(
      'hi',
      'gemini-2.0-flash',
      1
    );

    expect(measured.success).toBe(true);
    expect(measured.text).toBe('Hello world');
    expect(measured.ttft_ms).toBe(10);
    expect(measured.latency_ms).toBe(20);
    expect(measured.usage.outputTokens).toBe(12);
    expect(measured.usage.inputTokens).toBe(4);
    // Gemini reports no generation time, so throughput falls back to the
    // measured wall clock: 12 tokens in 20 ms.
    expect(measured.tokens_per_second).toBe(600);
    expect(measured.provenance.tokensPerSecond).toBe('derived');
  });

  it('sends the key in a header and never in the URL', async () => {
    const fetchImplementation = fetchReturning(() =>
      sseResponse(SUCCESSFUL_STREAM)
    );

    await provider(fetchImplementation).generate('hi', 'gemini-2.0-flash');

    const [call] = fetchImplementation.calls;
    const headers = call.init?.headers as Record<string, string>;

    // A URL lands in access logs and proxy logs. A header does not.
    expect(call.url).not.toContain('test-key');
    expect(call.url).toContain('alt=sse');
    expect(call.url).toContain(':streamGenerateContent');
    expect(headers['x-goog-api-key']).toBe('test-key');
  });

  it('sends the prompt in the documented contents shape', async () => {
    const fetchImplementation = fetchReturning(() =>
      sseResponse(SUCCESSFUL_STREAM)
    );

    await provider(fetchImplementation).generate('measure me', 'gemini-x');

    expect(JSON.parse(String(fetchImplementation.calls[0].init?.body))).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'measure me' }] }],
    });
  });
});

describe('GeminiProvider — the failure paths', () => {
  it('refuses to call the API at all when the key is missing', async () => {
    const fetchImplementation = fetchReturning(() => sseResponse([]));

    const instance = new GeminiProvider({
      apiKey: '',
      fetchImplementation,
      clock: steppedClock(10),
    });

    const result = await instance.generate('hi', 'gemini-2.0-flash');

    expect(result.success).toBe(false);
    expect(decodeFailure(result.error_message)?.code).toBe('not_configured');
    expect(result.error_message).toContain('GEMINI_API_KEY');
    // The point of the check: no request was made, so no quota was spent.
    expect(fetchImplementation.calls).toHaveLength(0);
  });

  it('reports a rejected credential as unauthorized, not as a provider fault', async () => {
    const fetchImplementation = fetchReturning(() =>
      errorResponse(401, { error: { message: 'API key not valid' } })
    );

    const result = await provider(fetchImplementation).generate('hi', 'g');

    expect(decodeFailure(result.error_message)?.code).toBe('unauthorized');
  });

  it('reports a quota rejection as a rate limit', async () => {
    const fetchImplementation = fetchReturning(() =>
      errorResponse(429, { error: { message: 'Resource has been exhausted' } })
    );

    const result = await provider(fetchImplementation).generate('hi', 'g');

    expect(decodeFailure(result.error_message)?.code).toBe('rate_limited');
  });

  it('reports an unknown model as a request error', async () => {
    const fetchImplementation = fetchReturning(() =>
      errorResponse(404, {
        error: { message: 'models/nope is not found for API version v1beta' },
      })
    );

    const result = await provider(fetchImplementation).generate('hi', 'nope');

    expect(decodeFailure(result.error_message)?.code).toBe('invalid_model');
  });

  it('times out without throwing', async () => {
    const instance = new GeminiProvider({
      apiKey: 'test-key',
      fetchImplementation: fetchThatHangs(),
      clock: steppedClock(10),
      timeoutMs: 20,
    });

    const result = await instance.generate('hi', 'g');

    expect(result.success).toBe(false);
    expect(decodeFailure(result.error_message)?.code).toBe('timeout');
  });
});

describe('the shared key check', () => {
  it('treats the .env.example placeholder as no key at all', () => {
    // Otherwise an unedited .env presents as configured and then fails
    // authentication, which reads as a provider fault instead of a setup step.
    expect(isUsableKey('your-gemini-api-key')).toBe(false);
    expect(isUsableKey('your-groq-api-key')).toBe(false);
    expect(isUsableKey('changeme')).toBe(false);
    expect(isUsableKey('   ')).toBe(false);
    expect(isUsableKey('AIzaSyRealLookingKey')).toBe(true);
  });
});
