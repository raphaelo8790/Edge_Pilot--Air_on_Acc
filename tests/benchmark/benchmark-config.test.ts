import {
  assertServerSide,
  loadBenchmarkConfig,
} from '@/modules/benchmark/infrastructure/config';

describe('loadBenchmarkConfig', () => {
  it('applies the documented defaults when nothing is set', () => {
    const config = loadBenchmarkConfig({});

    expect(config.ollamaHost).toBe('http://localhost:11434');
    expect(config.timeoutMs).toBe(60000);
    expect(config.fallbackOrder).toEqual(['ollama', 'groq', 'gemini']);
    expect(config.allowDemo).toBe(false);
    expect(config.warnings).toEqual([]);
  });

  it('reads the environment when it is set', () => {
    const config = loadBenchmarkConfig({
      OLLAMA_HOST: 'http://ollama:11434',
      GEMINI_API_KEY: ' key-a ',
      GROQ_API_KEY: 'key-b',
      BENCHMARK_TIMEOUT_MS: '15000',
      BENCHMARK_FALLBACK_ORDER: 'gemini, groq',
      BENCHMARK_ALLOW_DEMO: 'true',
    });

    expect(config.ollamaHost).toBe('http://ollama:11434');
    expect(config.geminiApiKey).toBe('key-a');
    expect(config.groqApiKey).toBe('key-b');
    expect(config.timeoutMs).toBe(15000);
    expect(config.fallbackOrder).toEqual(['gemini', 'groq']);
    expect(config.allowDemo).toBe(true);
  });

  it('warns and falls back rather than refusing to start on a bad timeout', () => {
    // A typo in one optional variable should not take the whole API down;
    // it should be visible instead. The warning is surfaced by
    // GET /api/v1/providers.
    const config = loadBenchmarkConfig({
      BENCHMARK_TIMEOUT_MS: 'soon',
    });

    expect(config.timeoutMs).toBe(60000);
    expect(config.warnings).toHaveLength(1);
    expect(config.warnings[0]).toContain('BENCHMARK_TIMEOUT_MS');
  });

  it('rejects a timeout outside the documented bounds', () => {
    expect(
      loadBenchmarkConfig({ BENCHMARK_TIMEOUT_MS: '5' })
        .timeoutMs
    ).toBe(60000);
    expect(
      loadBenchmarkConfig({
        BENCHMARK_TIMEOUT_MS: '99999999',
      }).timeoutMs
    ).toBe(60000);
  });

  it('warns and falls back on an unknown provider in the fallback order', () => {
    const config = loadBenchmarkConfig({
      BENCHMARK_FALLBACK_ORDER: 'ollama,openai',
    });

    expect(config.fallbackOrder).toEqual(['ollama', 'groq', 'gemini']);
    expect(config.warnings[0]).toContain('openai');
  });

  it('only enables the simulator on an exact opt-in', () => {
    expect(
      loadBenchmarkConfig({ BENCHMARK_ALLOW_DEMO: 'yes' })
        .allowDemo
    ).toBe(false);
    expect(
      loadBenchmarkConfig({ BENCHMARK_ALLOW_DEMO: 'TRUE' })
        .allowDemo
    ).toBe(false);
    expect(
      loadBenchmarkConfig({ BENCHMARK_ALLOW_DEMO: 'true' })
        .allowDemo
    ).toBe(true);
  });
});

describe('assertServerSide', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('does nothing on the server', () => {
    expect(() => assertServerSide('test')).not.toThrow();
  });

  it('throws the moment it is reached from a browser bundle', () => {
    // An API key that reaches a client bundle is published, and no later fix
    // un-publishes it. This must fail loudly at the point of the mistake.
    (globalThis as { window?: unknown }).window = {};

    expect(() => assertServerSide('loadBenchmarkConfig')).toThrow(
      /server-only/
    );
    expect(() => loadBenchmarkConfig({})).toThrow(
      /server-only/
    );
  });
});
