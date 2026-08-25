import type {
  Benchmark,
  BenchmarkResult,
} from '../entities/Benchmark';

export interface ComparisonResult {
  benchmarkId: string;
  provider: string;
  model: string;
  averageLatency: number;
  averageTps: number | null;
  successRate: number;
  rank: number;
}

export class ComparisonEngine {
  compare(
    results: BenchmarkResult[],
    benchmarks: Benchmark[]
  ): ComparisonResult[] {
    const groupedResults = this.groupByBenchmark(results);
    const benchmarksById = new Map(
      benchmarks.map(benchmark => [benchmark.id, benchmark])
    );

    const comparisons = Object.entries(groupedResults).map(
      ([benchmarkId, benchmarkResults]) => {
        const successfulResults = benchmarkResults.filter(
          result => result.success
        );

        const averageLatency =
          successfulResults.length > 0
            ? successfulResults.reduce(
                (sum, result) => sum + result.latencyMs,
                0
              ) / successfulResults.length
            : 0;

        const throughputResults = successfulResults.filter(
          result => result.tokensPerSecond !== null
        );

        const averageTps =
          throughputResults.length > 0
            ? throughputResults.reduce(
                (sum, result) =>
                  sum + (result.tokensPerSecond ?? 0),
                0
              ) / throughputResults.length
            : null;

        const successRate =
          benchmarkResults.length > 0
            ? (successfulResults.length / benchmarkResults.length) * 100
            : 0;

        const benchmark = benchmarksById.get(benchmarkId);

        return {
          benchmarkId,
          provider: benchmark?.providerId ?? 'unknown',
          model: benchmark?.model ?? 'unknown',
          averageLatency,
          averageTps,
          successRate,
          rank: 0,
        };
      }
    );

    comparisons.sort(
      (first, second) =>
        first.averageLatency - second.averageLatency
    );

    comparisons.forEach((comparison, index) => {
      comparison.rank = index + 1;
    });

    return comparisons;
  }

  private groupByBenchmark(
    results: BenchmarkResult[]
  ): Record<string, BenchmarkResult[]> {
    return results.reduce<Record<string, BenchmarkResult[]>>(
      (groupedResults, result) => {
        const benchmarkResults =
          groupedResults[result.benchmarkId] ?? [];

        benchmarkResults.push(result);
        groupedResults[result.benchmarkId] = benchmarkResults;

        return groupedResults;
      },
      {}
    );
  }
}
