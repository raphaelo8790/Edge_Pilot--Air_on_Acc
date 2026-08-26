import { CloudCatalog } from '../../src/modules/benchmark/infrastructure/CloudCatalog';

type Handler = (url: string, init?: RequestInit) => { status?: number; body?: unknown } | 'reject';

function stubFetch(handler: Handler) {
  const seen: Array<{ url: string; init?: RequestInit }> = [];

  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    const outcome = handler(url, init);

    if (outcome === 'reject') throw new TypeError('fetch failed');

    const status = outcome.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => outcome.body,
    } as Response;
  }) as typeof fetch;

  return { fetchImpl, seen };
}

describe('CloudCatalog — Groq', () => {
  const GROQ = {
    data: [
      { id: 'llama-3.3-70b-versatile', active: true, context_window: 131072 },
      { id: 'whisper-large-v3', active: true, context_window: 448 },
      { id: 'llama-guard-4-12b', active: true, context_window: 131072 },
      { id: 'llama-3.1-8b-instant', active: true, context_window: 131072 },
      { id: 'old-model', active: false, context_window: 8192 },
    ],
  };

  it('lists the chat models sorted, and counts what it left out', async () => {
    const { fetchImpl, seen } = stubFetch(() => ({ body: GROQ }));

    const status = await new CloudCatalog({
      provider: 'groq',
      apiKey: 'gsk_test',
      fetch: fetchImpl,
    }).status();

    expect(status.ok).toBe(true);
    expect(status.models.map((m) => m.name)).toEqual([
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
    ]);
    expect(status.models[0].contextWindow).toBe(131072);
    expect(status.omittedCount).toBe(3);
    expect(status.message).toContain('2 text models');

    // The key travels in a header, never in the URL.
    expect(seen[0].url).toBe('https://api.groq.com/openai/v1/models');
    expect(seen[0].url).not.toContain('gsk_test');
    expect((seen[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer gsk_test');
  });

  it('names the env var when the key is missing, without calling out', async () => {
    const { fetchImpl, seen } = stubFetch(() => ({ body: GROQ }));

    const status = await new CloudCatalog({
      provider: 'groq',
      apiKey: '',
      fetch: fetchImpl,
    }).status();

    expect(status.ok).toBe(false);
    expect(status.remedy).toContain('GROQ_API_KEY');
    expect(seen).toHaveLength(0);
  });

  it('points at the key on 401', async () => {
    const { fetchImpl } = stubFetch(() => ({ status: 401, body: { error: { message: 'Invalid API Key' } } }));

    const status = await new CloudCatalog({
      provider: 'groq',
      apiKey: 'gsk_bad',
      fetch: fetchImpl,
    }).status();

    expect(status.ok).toBe(false);
    expect(status.message).toContain('HTTP 401');
    expect(status.remedy).toContain('GROQ_API_KEY');
  });
});

describe('CloudCatalog — Gemini', () => {
  const PAGE_1 = {
    models: [
      {
        name: 'models/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        supportedGenerationMethods: ['generateContent', 'countTokens'],
        inputTokenLimit: 1048576,
      },
      {
        name: 'models/text-embedding-004',
        displayName: 'Text Embedding 004',
        supportedGenerationMethods: ['embedContent'],
      },
    ],
    nextPageToken: 'page-2',
  };
  const PAGE_2 = {
    models: [
      {
        name: 'models/gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        supportedGenerationMethods: ['generateContent'],
        inputTokenLimit: 1048576,
      },
      {
        name: 'models/imagen-4.0-generate-001',
        displayName: 'Imagen 4',
        supportedGenerationMethods: ['predict'],
      },
    ],
  };

  it('follows pagination, strips the models/ prefix and keeps text generators only', async () => {
    const { fetchImpl, seen } = stubFetch((url) =>
      url.includes('pageToken=page-2') ? { body: PAGE_2 } : { body: PAGE_1 }
    );

    const status = await new CloudCatalog({
      provider: 'gemini',
      apiKey: 'AIza-test',
      fetch: fetchImpl,
    }).status();

    expect(status.ok).toBe(true);
    expect(status.models.map((m) => m.name)).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
    expect(status.models[1].displayName).toBe('Gemini 2.5 Pro');
    expect(status.omittedCount).toBe(2);
    expect(seen).toHaveLength(2);

    for (const call of seen) {
      expect(call.url).not.toContain('AIza-test');
      expect((call.init?.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
    }
  });

  it('reports a connection failure with the host to check', async () => {
    const { fetchImpl } = stubFetch(() => 'reject');

    const status = await new CloudCatalog({
      provider: 'gemini',
      apiKey: 'AIza-test',
      fetch: fetchImpl,
    }).status();

    expect(status.ok).toBe(false);
    expect(status.message).toContain('connection failed');
    expect(status.remedy).toContain('generativelanguage.googleapis.com');
  });
});

describe('CloudCatalog — vision flag', () => {
  it('marks the Llama 4 family on Groq and every gemini-* model on Gemini', async () => {
    const groq = await new CloudCatalog({
      provider: 'groq',
      apiKey: 'gsk_test',
      fetch: stubFetch(() => ({
        body: {
          data: [
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct', active: true },
            { id: 'llama-3.1-8b-instant', active: true },
          ],
        },
      })).fetchImpl,
    }).status();

    expect(groq.models.map((m) => [m.name, m.supportsVision])).toEqual([
      ['llama-3.1-8b-instant', false],
      ['meta-llama/llama-4-scout-17b-16e-instruct', true],
    ]);

    const gemini = await new CloudCatalog({
      provider: 'gemini',
      apiKey: 'AIza-test',
      fetch: stubFetch(() => ({
        body: {
          models: [
            { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] },
          ],
        },
      })).fetchImpl,
    }).status();

    expect(gemini.models.map((m) => [m.name, m.supportsVision])).toEqual([
      ['gemini-2.5-flash', true],
      ['gemma-3-27b-it', false],
    ]);
  });
});
