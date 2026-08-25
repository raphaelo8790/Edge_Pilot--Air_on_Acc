import { Benchmark, BenchmarkResult, ReadinessScore } from '../entities/Benchmark';

export interface BenchmarkRepository {
  create(benchmark: Omit<Benchmark, 'id' | 'createdAt' | 'completedAt'>): Promise<Benchmark>;
  findById(id: string): Promise<Benchmark | null>;
  findByUserId(userId: string): Promise<Benchmark[]>;
  update(id: string, data: Partial<Benchmark>): Promise<Benchmark>;
  delete(id: string): Promise<void>;
  
  // Results
  addResult(result: Omit<BenchmarkResult, 'id' | 'createdAt'>): Promise<BenchmarkResult>;
  getResults(benchmarkId: string): Promise<BenchmarkResult[]>;
  
  // Readiness
  addReadinessScore(score: Omit<ReadinessScore, 'id' | 'createdAt'>): Promise<ReadinessScore>;
  getReadinessScore(benchmarkId: string): Promise<ReadinessScore | null>;
}
