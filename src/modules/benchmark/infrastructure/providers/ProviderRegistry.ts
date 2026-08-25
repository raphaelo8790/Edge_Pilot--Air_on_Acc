/**
 * The provider registry — one place that knows which adapters exist, which
 * are usable in this environment, and in what order to try them.
 *
 * Constructed from a `BenchmarkConfig` rather than reading `process.env`
 * itself, so a test can build a registry for any environment without
 * mutating global state.
 */

import type { BenchmarkConfig } from '../config';
import { DemoProvider } from './DemoProvider';
import { GeminiProvider } from './GeminiProvider';
import { GroqProvider } from './GroqProvider';
import { OllamaProvider } from './OllamaProvider';
import type { BenchmarkFetch, MillisecondClock } from './http';
import type { MeasuredAIProvider, ProviderMetadata } from './types';

export interface ProviderRegistryOptions {
  fetchImplementation?: BenchmarkFetch;
  clock?: MillisecondClock;
}

export interface ProviderAvailability extends ProviderMetadata {
  isConfigured: boolean;
  /** Why it is unusable, when it is. */
  reason: string | null;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, MeasuredAIProvider>();

  private readonly fallbackOrder: string[];

  constructor(
    config: BenchmarkConfig,
    options: ProviderRegistryOptions = {}
  ) {
    const shared = {
      fetchImplementation: options.fetchImplementation,
      clock: options.clock,
      timeoutMs: config.timeoutMs,
    };

    this.register(
      new OllamaProvider({ ...shared, host: config.ollamaHost })
    );
    this.register(
      new GeminiProvider({ ...shared, apiKey: config.geminiApiKey })
    );
    this.register(new GroqProvider({ ...shared, apiKey: config.groqApiKey }));

    // Opt-in only. A registry that silently contains a simulator is a registry
    // that can silently return fabricated numbers.
    if (config.allowDemo) {
      this.register(new DemoProvider(shared));
    }

    this.fallbackOrder = config.fallbackOrder.slice();
  }

  private register(provider: MeasuredAIProvider): void {
    this.providers.set(provider.name, provider);
  }

  public get(name: string): MeasuredAIProvider | null {
    return this.providers.get(name) ?? null;
  }

  public has(name: string): boolean {
    return this.providers.has(name);
  }

  public names(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * What the /api/v1/providers endpoint reports: every adapter, whether it is
   * usable right now, and why not when it is not.
   */
  public availability(): ProviderAvailability[] {
    return this.names().map((name) => {
      const provider = this.providers.get(name)!;
      const metadata = provider.describe();
      const isConfigured = provider.isConfigured();

      return {
        ...metadata,
        isConfigured,
        reason: isConfigured
          ? null
          : `No credential or host configured for ${name} in this environment.`,
      };
    });
  }

  /**
   * The chain for one request: the requested provider first, then the
   * configured order, skipping anything unusable and anything already in the
   * chain.
   *
   * Unconfigured providers are excluded rather than attempted. Calling a
   * provider with no key would produce an `unauthorized` result, and that
   * would be recorded as a failed measurement of the provider rather than
   * what it is — a gap in this machine's setup.
   */
  public chainFor(requested: string): MeasuredAIProvider[] {
    const chain: MeasuredAIProvider[] = [];
    const seen = new Set<string>();

    const consider = (name: string) => {
      if (seen.has(name)) {
        return;
      }

      seen.add(name);

      const provider = this.providers.get(name);

      if (provider && provider.isConfigured()) {
        chain.push(provider);
      }
    };

    consider(requested);

    for (let index = 0; index < this.fallbackOrder.length; index += 1) {
      consider(this.fallbackOrder[index]);
    }

    return chain;
  }
}

/**
 * Cached per-process registry for the API routes. Tests construct their own
 * rather than using this, so no test depends on process-wide state.
 */
let cachedRegistry: ProviderRegistry | null = null;

export function getProviderRegistry(config: BenchmarkConfig): ProviderRegistry {
  if (cachedRegistry === null) {
    cachedRegistry = new ProviderRegistry(config);
  }

  return cachedRegistry;
}

export function resetProviderRegistry(): void {
  cachedRegistry = null;
}
