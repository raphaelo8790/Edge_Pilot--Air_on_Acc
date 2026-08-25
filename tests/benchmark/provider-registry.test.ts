import { loadBenchmarkConfig } from '@/modules/benchmark/infrastructure/config';
import { ProviderRegistry } from '@/modules/benchmark/infrastructure/providers/ProviderRegistry';

function registryFor(environment: Record<string, string>): ProviderRegistry {
  return new ProviderRegistry(
    loadBenchmarkConfig(environment)
  );
}

describe('ProviderRegistry — what exists', () => {
  it('registers the three real adapters and not the simulator', () => {
    const registry = registryFor({});

    expect(registry.names()).toEqual(['ollama', 'gemini', 'groq']);
    expect(registry.has('demo')).toBe(false);
  });

  it('registers the simulator only on an explicit opt-in', () => {
    // A registry that silently contains a simulator is a registry that can
    // silently return fabricated numbers.
    const registry = registryFor({ BENCHMARK_ALLOW_DEMO: 'true' });

    expect(registry.has('demo')).toBe(true);
  });
});

describe('ProviderRegistry — what is usable', () => {
  it('reports every adapter with a reason when it is not configured', () => {
    const availability = registryFor({ GROQ_API_KEY: 'gsk_real' }).availability();

    const byName = Object.fromEntries(
      availability.map((entry) => [entry.name, entry])
    );

    // Ollama needs only a host, and the host has a default.
    expect(byName.ollama.isConfigured).toBe(true);
    expect(byName.ollama.reason).toBeNull();

    expect(byName.groq.isConfigured).toBe(true);

    expect(byName.gemini.isConfigured).toBe(false);
    expect(byName.gemini.reason).toContain('gemini');
  });

  it('carries the official source for every adapter', () => {
    // The acceptance criteria require at least one official source behind
    // every recommendation, so the source travels with the adapter.
    for (const entry of registryFor({}).availability()) {
      expect(entry.officialSource.length).toBeGreaterThan(10);
    }
  });
});

describe('ProviderRegistry — the fallback chain', () => {
  it('puts the requested provider first, whatever the configured order says', () => {
    const registry = registryFor({
      GEMINI_API_KEY: 'k1',
      GROQ_API_KEY: 'k2',
      BENCHMARK_FALLBACK_ORDER: 'ollama,groq,gemini',
    });

    expect(registry.chainFor('gemini').map((p) => p.name)).toEqual([
      'gemini',
      'ollama',
      'groq',
    ]);
  });

  it('skips providers with no credential instead of calling them', () => {
    // Calling a keyless provider would record `unauthorized` as if it were a
    // measurement of the provider rather than a gap in this machine's setup.
    const registry = registryFor({ GROQ_API_KEY: 'k2' });

    expect(registry.chainFor('ollama').map((p) => p.name)).toEqual([
      'ollama',
      'groq',
    ]);
  });

  it('does not repeat a provider that is both requested and in the order', () => {
    const registry = registryFor({ GEMINI_API_KEY: 'k1', GROQ_API_KEY: 'k2' });

    const names = registry.chainFor('ollama').map((p) => p.name);

    expect(names).toEqual(Array.from(new Set(names)));
  });

  it('returns an empty chain when nothing at all is usable', () => {
    const registry = registryFor({ OLLAMA_HOST: '' });

    expect(registry.chainFor('ollama')).toEqual([]);
  });

  it('never puts the simulator in a fallback chain it was not asked for', () => {
    const registry = registryFor({ BENCHMARK_ALLOW_DEMO: 'true' });

    expect(registry.chainFor('ollama').map((p) => p.name)).not.toContain(
      'demo'
    );
    expect(registry.chainFor('demo')[0].name).toBe('demo');
  });
});
