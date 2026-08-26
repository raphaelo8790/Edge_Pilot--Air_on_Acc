/**
 * Composition root for the benchmark module.
 *
 * The API routes ask for a fully wired use case and get one; they never
 * construct an adapter, read an environment variable, or touch Prisma
 * directly. That keeps the routes to HTTP concerns — parse, dispatch, choose a
 * status code — and keeps every wiring decision in one readable place.
 */

import { prisma } from '@/lib/prisma';
import { ReadinessCalculator } from '../core/services/ReadinessCalculator';
import { OllamaCatalog } from './OllamaCatalog';
import { OllamaResidencyProbe } from './OllamaResidencyProbe';
import { BenchmarkRunner } from '../application/services/BenchmarkRunner';
import { RunBenchmark } from '../application/use-cases/RunBenchmark';
import { RunComparison } from '../application/use-cases/RunComparison';
import { assertServerSide, loadBenchmarkConfig } from './config';
import {
  getProviderRegistry,
  ProviderRegistry,
} from './providers/ProviderRegistry';
import {
  applyVisitorKeys,
  hasVisitorKeys,
  type VisitorKeys,
} from './visitor-keys';
import { PrismaBenchmarkContext } from './repositories/PrismaBenchmarkContext';
import { RecordedProvider, recordedChain } from './providers/RecordedProvider';
import type { RecordedMeasurement } from '../application/dtos/BenchmarkRequest';
import { PrismaBenchmarkRepository } from './repositories/PrismaBenchmarkRepository';

/**
 * The provider registry. With a visitor's own keys, a fresh registry is built
 * for this request only and never cached - see visitor-keys.ts. Without,
 * the process-wide one built from the server's configuration.
 */
export function benchmarkRegistry(keys?: VisitorKeys): ProviderRegistry {
  assertServerSide('benchmarkRegistry');
  const config = loadBenchmarkConfig();

  if (keys && hasVisitorKeys(keys)) {
    return new ProviderRegistry(applyVisitorKeys(config, keys));
  }

  return getProviderRegistry(config);
}

export function benchmarkRepository(): PrismaBenchmarkRepository {
  assertServerSide('benchmarkRepository');
  return new PrismaBenchmarkRepository(prisma);
}

export function runBenchmarkUseCase(keys?: VisitorKeys): RunBenchmark {
  assertServerSide('runBenchmarkUseCase');

  const config = loadBenchmarkConfig();
  const probe = new OllamaResidencyProbe({ host: config.ollamaHost });

  return new RunBenchmark({
    repository: benchmarkRepository(),
    runner: new BenchmarkRunner(
      benchmarkRegistry(keys),
      new ReadinessCalculator(),
      // Measures memory residency straight after a local run, so hardware fit
      // is observed rather than assumed. Any failure returns nulls and the
      // component is simply excluded from the score.
      (model) => probe.observe(model)
    ),
    context: new PrismaBenchmarkContext(prisma),
  });
}

/**
 * The same use case, scoring a run the visitor's browser already measured
 * against its own Ollama. Same repository, same calculator, same runner —
 * only the provider is a replay, and the residency readings are the ones
 * the browser took instead of ones this server cannot take.
 */
export function scoreRecordedBenchmarkUseCase(
  recorded: RecordedMeasurement
): RunBenchmark {
  assertServerSide('scoreRecordedBenchmarkUseCase');

  const provider = new RecordedProvider(recorded);
  const probe = provider.residencyProbe();

  return new RunBenchmark({
    repository: benchmarkRepository(),
    runner: new BenchmarkRunner(
      recordedChain(provider),
      new ReadinessCalculator(),
      () => probe()
    ),
    context: new PrismaBenchmarkContext(prisma),
  });
}

export function benchmarkConfigWarnings(): string[] {
  assertServerSide('benchmarkConfigWarnings');
  return loadBenchmarkConfig().warnings;
}

export function runComparisonUseCase(keys?: VisitorKeys): RunComparison {
  assertServerSide('runComparisonUseCase');

  const config = loadBenchmarkConfig();
  const probe = new OllamaResidencyProbe({ host: config.ollamaHost });
  const registry = benchmarkRegistry(keys);

  return new RunComparison({
    registry,
    // A factory rather than one shared runner: each entrant gets clean state,
    // which matters when a comparison runs entrants concurrently.
    createRunner: () =>
      new BenchmarkRunner(registry, new ReadinessCalculator(), (model) =>
        probe.observe(model)
      ),
    createRecordedRunner: (recorded) => {
      const provider = new RecordedProvider(recorded);
      const replay = provider.residencyProbe();
      return new BenchmarkRunner(
        recordedChain(provider),
        new ReadinessCalculator(),
        () => replay()
      );
    },
  });
}

export function localModelCatalogue(): OllamaCatalog {
  assertServerSide('localModelCatalogue');
  return new OllamaCatalog({ host: loadBenchmarkConfig().ollamaHost });
}
