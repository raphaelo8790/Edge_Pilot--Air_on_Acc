/**
 * Prisma implementation of the BenchmarkRepository port.
 *
 * Mapping notes:
 *  - The port speaks camelCase TypeScript; the database is snake_case. The
 *    @map() directives in schema.prisma do that translation, so nothing here
 *    needs to.
 *  - `evidence` and `limitations` are Json columns. Prisma types them as
 *    JsonValue, so they are cast back to string[] on the way out — the entity
 *    declares string[] and the writer only ever puts strings in.
 *  - Nothing in this file swallows an error. A caller that wants to degrade
 *    gracefully when the database is down decides that for itself; a
 *    repository that silently reports success would be worse than one that
 *    fails loudly.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  Benchmark,
  BenchmarkResult,
  ReadinessScore,
} from '../../core/entities/Benchmark';
import type { BenchmarkRepository } from '../../core/ports/BenchmarkRepository';

type BenchmarkStatus = Benchmark['status'];

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function toBenchmark(row: {
  id: string;
  workloadId: string;
  deviceId: string;
  providerId: string;
  model: string;
  prompt: string;
  iterations: number;
  status: string;
  userId: string;
  createdAt: Date;
  completedAt: Date | null;
}): Benchmark {
  return {
    id: row.id,
    workloadId: row.workloadId,
    deviceId: row.deviceId,
    providerId: row.providerId,
    model: row.model,
    prompt: row.prompt,
    iterations: row.iterations,
    status: row.status as BenchmarkStatus,
    userId: row.userId,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export class PrismaBenchmarkRepository implements BenchmarkRepository {
  constructor(private readonly client: PrismaClient) {}

  public async create(
    benchmark: Omit<Benchmark, 'id' | 'createdAt' | 'completedAt'>
  ): Promise<Benchmark> {
    const row = await this.client.benchmark.create({
      data: {
        workloadId: benchmark.workloadId,
        deviceId: benchmark.deviceId,
        providerId: benchmark.providerId,
        model: benchmark.model,
        prompt: benchmark.prompt,
        iterations: benchmark.iterations,
        status: benchmark.status,
        userId: benchmark.userId,
      },
    });

    return toBenchmark(row);
  }

  public async findById(id: string): Promise<Benchmark | null> {
    const row = await this.client.benchmark.findUnique({ where: { id } });

    return row === null ? null : toBenchmark(row);
  }

  public async findByUserId(userId: string): Promise<Benchmark[]> {
    const rows = await this.client.benchmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toBenchmark);
  }

  public async update(
    id: string,
    data: Partial<Benchmark>
  ): Promise<Benchmark> {
    const row = await this.client.benchmark.update({
      where: { id },
      data: {
        status: data.status,
        completedAt: data.completedAt,
        model: data.model,
        prompt: data.prompt,
        iterations: data.iterations,
      },
    });

    return toBenchmark(row);
  }

  public async delete(id: string): Promise<void> {
    await this.client.benchmark.delete({ where: { id } });
  }

  public async addResult(
    result: Omit<BenchmarkResult, 'id' | 'createdAt'>
  ): Promise<BenchmarkResult> {
    const row = await this.client.benchmarkResult.create({
      data: {
        benchmarkId: result.benchmarkId,
        iteration: result.iteration,
        latencyMs: result.latencyMs,
        tokensPerSecond: result.tokensPerSecond,
        ttftMs: result.ttftMs,
        success: result.success,
        errorMessage: result.errorMessage,
      },
    });

    return row;
  }

  /**
   * Bulk insert for a whole run. Not on the port — the port is a contract
   * another member owns and widening it is an integration decision — but a
   * per-iteration round trip to a hosted database is a real cost, so the
   * concrete class offers it and the caller uses it when it has the client.
   */
  public async addResults(
    results: Array<Omit<BenchmarkResult, 'id' | 'createdAt'>>
  ): Promise<number> {
    if (results.length === 0) {
      return 0;
    }

    const created = await this.client.benchmarkResult.createMany({
      data: results.map((result) => ({
        benchmarkId: result.benchmarkId,
        iteration: result.iteration,
        latencyMs: result.latencyMs,
        tokensPerSecond: result.tokensPerSecond,
        ttftMs: result.ttftMs,
        success: result.success,
        errorMessage: result.errorMessage,
      })),
    });

    return created.count;
  }

  public async getResults(benchmarkId: string): Promise<BenchmarkResult[]> {
    return this.client.benchmarkResult.findMany({
      where: { benchmarkId },
      orderBy: { iteration: 'asc' },
    });
  }

  public async addReadinessScore(
    score: Omit<ReadinessScore, 'id' | 'createdAt'>
  ): Promise<ReadinessScore> {
    // Upsert rather than create: readiness_scores.benchmark_id is @unique, so
    // re-scoring an existing benchmark would otherwise throw a constraint
    // violation instead of updating.
    const row = await this.client.readinessScore.upsert({
      where: { benchmarkId: score.benchmarkId },
      create: {
        benchmarkId: score.benchmarkId,
        hardwareFit: Math.round(score.hardwareFit),
        latencyScore: Math.round(score.latencyScore),
        privacyScore: Math.round(score.privacyScore),
        costScore: Math.round(score.costScore),
        reliabilityScore: Math.round(score.reliabilityScore),
        overallReadiness: Math.round(score.overallReadiness),
        recommendation: score.recommendation,
        evidence: score.evidence,
        limitations: score.limitations,
      },
      update: {
        hardwareFit: Math.round(score.hardwareFit),
        latencyScore: Math.round(score.latencyScore),
        privacyScore: Math.round(score.privacyScore),
        costScore: Math.round(score.costScore),
        reliabilityScore: Math.round(score.reliabilityScore),
        overallReadiness: Math.round(score.overallReadiness),
        recommendation: score.recommendation,
        evidence: score.evidence,
        limitations: score.limitations,
      },
    });

    return {
      ...row,
      evidence: toStringArray(row.evidence),
      limitations: toStringArray(row.limitations),
    };
  }

  public async getReadinessScore(
    benchmarkId: string
  ): Promise<ReadinessScore | null> {
    const row = await this.client.readinessScore.findUnique({
      where: { benchmarkId },
    });

    if (row === null) {
      return null;
    }

    return {
      ...row,
      evidence: toStringArray(row.evidence),
      limitations: toStringArray(row.limitations),
    };
  }

  /**
   * Resolves a provider slug ("ollama") to its uuid primary key.
   *
   * benchmarks.provider_id is a foreign key onto providers.id, but the API
   * request names a provider by slug. Writing the slug straight into the
   * column — as the original scaffold did — fails the foreign key at insert
   * time. providers.name is @unique, so this lookup is exact.
   */
  public async resolveProviderId(slug: string): Promise<string | null> {
    const provider = await this.client.provider.findUnique({
      where: { name: slug },
      select: { id: true },
    });

    return provider?.id ?? null;
  }
}
