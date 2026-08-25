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
import { getProviderRegistry, type ProviderRegistry } from './providers/ProviderRegistry';
import { PrismaBenchmarkContext } from './repositories/PrismaBenchmarkContext';
import { PrismaBenchmarkRepository } from './repositories/PrismaBenchmarkRepository';

export function benchmarkRegistry(): ProviderRegistry {
  assertServerSide('benchmarkRegistry');
  return getProviderRegistry(loadBenchmarkConfig());
}

export function benchmarkRepository(): PrismaBenchmarkRepository {
  assertServerSide('benchmarkRepository');
  return new PrismaBenchmarkRepository(prisma);
}

export function runBenchmarkUseCase(): RunBenchmark {
  assertServerSide('runBenchmarkUseCase');

  const config = loadBenchmarkConfig();
  const probe = new OllamaResidencyProbe({ host: config.ollamaHost });

  return new RunBenchmark({
    repository: benchmarkRepository(),
    runner: new BenchmarkRunner(
      benchmarkRegistry(),
      new ReadinessCalculator(),
      // Measures memory residency straight after a local run, so hardware fit
      // is observed rather than assumed. Any failure returns nulls and the
      // component is simply excluded from the score.
      (model) => probe.observe(model)
    ),
    context: new PrismaBenchmarkContext(prisma),
  });
}

export function benchmarkConfigWarnings(): string[] {
  assertServerSide('benchmarkConfigWarnings');
  return loadBenchmarkConfig().warnings;
}

export function runComparisonUseCase(): RunComparison {
  assertServerSide('runComparisonUseCase');

  const config = loadBenchmarkConfig();
  const probe = new OllamaResidencyProbe({ host: config.ollamaHost });

  return new RunComparison({
    registry: benchmarkRegistry(),
    // A factory rather than one shared runner: each entrant gets clean state,
    // which matters when a comparison runs entrants concurrently.
    createRunner: () =>
      new BenchmarkRunner(benchmarkRegistry(), new ReadinessCalculator(), (model) =>
        probe.observe(model)
      ),
  });
}

export function localModelCatalogue(): OllamaCatalog {
  assertServerSide('localModelCatalogue');
  return new OllamaCatalog({ host: loadBenchmarkConfig().ollamaHost });
}
