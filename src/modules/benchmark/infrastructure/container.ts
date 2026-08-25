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
import { BenchmarkRunner } from '../application/services/BenchmarkRunner';
import { RunBenchmark } from '../application/use-cases/RunBenchmark';
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

  return new RunBenchmark({
    repository: benchmarkRepository(),
    runner: new BenchmarkRunner(benchmarkRegistry(), new ReadinessCalculator()),
    context: new PrismaBenchmarkContext(prisma),
  });
}

export function benchmarkConfigWarnings(): string[] {
  assertServerSide('benchmarkConfigWarnings');
  return loadBenchmarkConfig().warnings;
}
