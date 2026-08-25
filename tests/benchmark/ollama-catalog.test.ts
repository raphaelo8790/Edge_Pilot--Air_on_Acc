import { OllamaCatalog } from '../../src/modules/benchmark/infrastructure/OllamaCatalog';

const realFetch = global.fetch;

function stubFetch(
  handler: (url: string) => { status?: number; body?: unknown } | 'reject'
) {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const outcome = handler(url);

    if (outcome === 'reject') {
      throw new TypeError('fetch failed');
    }

    const status = outcome.status ?? 200;

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => outcome.body,
    } as Response;
  }) as typeof fetch;
}

afterEach(() => {
  global.fetch = realFetch;
});

const TAGS = {
  models: [
    {
      name: 'mistral:7b',
      size: 4_370_000_000,
      details: {
        parameter_size: '7.2B',
        quantization_level: 'Q4_K_M',
        families: ['llama'],
      },
    },
    {
      name: 'llama3.2:latest',
      size: 2_020_000_000,
      details: { parameter_size: '3.2B', quantization_level: 'Q4_K_M' },
    },
  ],
};

describe('OllamaCatalog', () => {
  it('reports ready and lists the models, sorted', async () => {
    stubFetch((url) =>
      url.endsWith('/api/version')
        ? { body: { version: '0.32.14' } }
        : { body: TAGS }
    );

    const status = await new OllamaCatalog({ host: 'http://localhost:11434' }).status();

    expect(status.ok).toBe(true);
    expect(status.state).toBe('ready');
    expect(status.version).toBe('0.32.14');
    expect(status.models.map((m) => m.name)).toEqual([
      'llama3.2:latest',
      'mistral:7b',
    ]);
    expect(status.models[1].parameterSize).toBe('7.2B');
    expect(status.models[1].quantization).toBe('Q4_K_M');
    expect(status.message).toContain('2 models');
    expect(status.remedy).toBeNull();
  });

  it('tells the user how to start the runtime when nothing answers', async () => {
    stubFetch(() => 'reject');

    const status = await new OllamaCatalog({ host: 'http://localhost:11434' }).status();

    expect(status.ok).toBe(false);
    expect(status.state).toBe('unreachable');
    expect(status.message).toContain('http://localhost:11434');
    expect(status.remedy).toContain('ollama serve');
  });

  it('distinguishes running-but-empty from not running', async () => {
    stubFetch((url) =>
      url.endsWith('/api/version')
        ? { body: { version: '0.32.14' } }
        : { body: { models: [] } }
    );

    const status = await new OllamaCatalog({ host: 'http://localhost:11434' }).status();

    expect(status.state).toBe('reachable-no-models');
    expect(status.ok).toBe(false);
    expect(status.remedy).toContain('ollama pull');
  });

  it('separates a malformed host from an unreachable one', async () => {
    stubFetch(() => 'reject');

    const status = await new OllamaCatalog({ host: 'localhost:11434' }).status();

    expect(status.state).toBe('bad-host');
    expect(status.remedy).toContain('including the scheme');
  });

  it('reports a missing host as not configured', async () => {
    const status = await new OllamaCatalog({ host: '   ' }).status();

    expect(status.state).toBe('not-configured');
    expect(status.remedy).toContain('OLLAMA_HOST');
  });

  it('treats a non-200 from the version endpoint as unreachable', async () => {
    stubFetch(() => ({ status: 503 }));

    const status = await new OllamaCatalog({ host: 'http://localhost:11434' }).status();

    expect(status.state).toBe('unreachable');
    expect(status.message).toContain('HTTP 503');
  });
});

/**
 * Which models are awake, from /api/ps.
 *
 * The distinction that matters is between "asleep" and "we could not ask".
 * Both are falsy, and conflating them would put a confident claim (a model
 * shown sleeping, a cold start predicted) on top of a missing answer.
 */
describe('OllamaCatalog residency', () => {
  const route = (
    url: string,
    ps: { status?: number; body?: unknown } | 'reject'
  ) => {
    if (url.endsWith('/api/version')) return { body: { version: '0.32.14' } };
    if (url.endsWith('/api/ps')) return ps;
    return { body: TAGS };
  };

  it('marks a loaded model resident and an unloaded one asleep', async () => {
    stubFetch((url) =>
      route(url, { body: { models: [{ name: 'mistral:7b' }] } })
    );

    const status = await new OllamaCatalog({ host: 'http://localhost:11434' }).status();
    const byName = Object.fromEntries(
      status.models.map((model) => [model.name, model.resident])
    );

    expect(byName['mistral:7b']).toBe(true);
    expect(byName['llama3.2:latest']).toBe(false);
  });

  it('reports null — not asleep — when /api/ps cannot be read', async () => {
    stubFetch((url) => route(url, 'reject'));

    const status = await new OllamaCatalog({ host: 'http://localhost:11434' }).status();

    status.models.forEach((model) => {
      expect(model.resident).toBeNull();
    });
  });

  it('reports null when /api/ps answers with an error status', async () => {
    stubFetch((url) => route(url, { status: 500 }));

    const status = await new OllamaCatalog({ host: 'http://localhost:11434' }).status();

    status.models.forEach((model) => {
      expect(model.resident).toBeNull();
    });
  });

  it('everything is asleep when nothing is loaded', async () => {
    stubFetch((url) => route(url, { body: { models: [] } }));

    const status = await new OllamaCatalog({ host: 'http://localhost:11434' }).status();

    status.models.forEach((model) => {
      expect(model.resident).toBe(false);
    });
  });

  it('matches on the `model` field too, not only `name`', async () => {
    // /api/ps and /api/tags do not always spell a tag the same way, and a
    // missed match would report a loaded model as asleep.
    stubFetch((url) =>
      route(url, { body: { models: [{ model: 'llama3.2:latest' }] } })
    );

    const status = await new OllamaCatalog({ host: 'http://localhost:11434' }).status();
    const llama = status.models.find((m) => m.name === 'llama3.2:latest');

    expect(llama?.resident).toBe(true);
  });
});
