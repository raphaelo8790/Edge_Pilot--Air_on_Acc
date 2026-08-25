/**
 * The use case sits between HTTP and the measurement, and almost everything it
 * does is a refusal: refuse to call a provider for a workload that does not
 * exist, refuse to attribute a run to the wrong user, refuse to throw away a
 * measurement just because the database went down mid-run.
 *
 * These tests use the real BenchmarkRunner over scripted providers rather than
 * a stubbed runner, so the envelope that comes out is the one the API actually
 * returns.
 */

import { BenchmarkRunner } from '@/modules/benchmark/application/services/BenchmarkRunner';
import { ReadinessCalculator } from '@/modules/benchmark/core/services/ReadinessCalculator';
import {
  RunBenchmark,
  statusForFailedRun,
  type BenchmarkContextGateway,
} from '@/modules/benchmark/application/use-cases/RunBenchmark';
import type { BenchmarkRepository } from '@/modules/benchmark/core/ports/BenchmarkRepository';
import type {
  Benchmark,
  BenchmarkResult,
  ReadinessScore,
} from '@/modules/benchmark/core/entities/Benchmark';
import type { BenchmarkRequest } from '@/modules/benchmark/application/dtos/BenchmarkRequest';
import type { BenchmarkRun } from '@/modules/benchmark/application/dtos/BenchmarkMeasurement';
import {
  failedMeasurement,
  fakeProvider,
  stubRegistry,
  successfulMeasurement,
} from './helpers';

const WORKLOAD_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_OWNER_ID = '44444444-4444-4444-8444-444444444444';

const REQUEST: BenchmarkRequest = {
  workload_id: WORKLOAD_ID,
  device_id: DEVICE_ID,
  provider: 'ollama',
  model: 'llama3.2:1b',
  prompt: 'hi',
  iterations: 3,
};

/** A repository that keeps everything in arrays and can be told to break. */
class InMemoryRepository implements BenchmarkRepository {
  public benchmarks: Benchmark[] = [];
  public results: BenchmarkResult[] = [];
  public scores: ReadinessScore[] = [];

  /** Set to the name of a method that should reject instead of storing. */
  public failOn: 'create' | 'addResult' | 'addReadinessScore' | 'update' | null =
    null;

  private sequence = 0;

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  private guard(method: NonNullable<InMemoryRepository['failOn']>): void {
    if (this.failOn === method) {
      throw new Error(`simulated database failure in ${method}`);
    }
  }

  public async create(
    benchmark: Omit<Benchmark, 'id' | 'createdAt' | 'completedAt'>
  ): Promise<Benchmark> {
    this.guard('create');

    const row: Benchmark = {
      ...benchmark,
      id: this.id('benchmark'),
      createdAt: new Date(0),
      completedAt: null,
    };

    this.benchmarks.push(row);

    return row;
  }

  public async findById(id: string): Promise<Benchmark | null> {
    return this.benchmarks.find((row) => row.id === id) ?? null;
  }

  public async findByUserId(userId: string): Promise<Benchmark[]> {
    return this.benchmarks.filter((row) => row.userId === userId);
  }

  public async update(id: string, data: Partial<Benchmark>): Promise<Benchmark> {
    this.guard('update');

    const index = this.benchmarks.findIndex((row) => row.id === id);

    if (index === -1) {
      throw new Error(`no benchmark ${id}`);
    }

    this.benchmarks[index] = { ...this.benchmarks[index], ...data };

    return this.benchmarks[index];
  }

  public async delete(id: string): Promise<void> {
    this.benchmarks = this.benchmarks.filter((row) => row.id !== id);
  }

  public async addResult(
    result: Omit<BenchmarkResult, 'id' | 'createdAt'>
  ): Promise<BenchmarkResult> {
    this.guard('addResult');

    const row: BenchmarkResult = {
      ...result,
      id: this.id('result'),
      createdAt: new Date(0),
    };

    this.results.push(row);

    return row;
  }

  public async getResults(benchmarkId: string): Promise<BenchmarkResult[]> {
    return this.results.filter((row) => row.benchmarkId === benchmarkId);
  }

  public async addReadinessScore(
    score: Omit<ReadinessScore, 'id' | 'createdAt'>
  ): Promise<ReadinessScore> {
    this.guard('addReadinessScore');

    const row: ReadinessScore = {
      ...score,
      id: this.id('score'),
      createdAt: new Date(0),
    };

    this.scores.push(row);

    return row;
  }

  public async getReadinessScore(
    benchmarkId: string
  ): Promise<ReadinessScore | null> {
    return this.scores.find((row) => row.benchmarkId === benchmarkId) ?? null;
  }
}

interface ContextOptions {
  workloadUserId?: string | null;
  deviceUserId?: string | null;
  providerId?: string | null;
  throws?: boolean;
}

function contextGateway(options: ContextOptions = {}): BenchmarkContextGateway {
  return {
    async resolveContext() {
      if (options.throws) {
        throw new Error('connection terminated unexpectedly');
      }

      return {
        workloadUserId:
          options.workloadUserId === undefined
            ? OWNER_ID
            : options.workloadUserId,
        deviceUserId:
          options.deviceUserId === undefined ? OWNER_ID : options.deviceUserId,
      };
    },
    async resolveProviderId() {
      return options.providerId === undefined
        ? 'provider-row-id'
        : options.providerId;
    },
  };
}

interface Harness {
  useCase: RunBenchmark;
  repository: InMemoryRepository;
  providers: ReturnType<typeof fakeProvider>[];
}

function harness(
  options: ContextOptions = {},
  chain: ReturnType<typeof fakeProvider>[] = [
    fakeProvider('ollama', () => successfulMeasurement()),
  ],
  repository = new InMemoryRepository()
): Harness {
  const runner = new BenchmarkRunner(
    stubRegistry(chain),
    new ReadinessCalculator()
  );

  return {
    repository,
    providers: chain,
    useCase: new RunBenchmark({
      repository,
      runner,
      context: contextGateway(options),
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    }),
  };
}

function expectSuccess(
  outcome: Awaited<ReturnType<RunBenchmark['execute']>>
): BenchmarkRun {
  if (!outcome.ok) {
    throw new Error(`expected success, got ${outcome.status} ${outcome.error}`);
  }

  return outcome.run;
}

describe('RunBenchmark — the happy path', () => {
  it('measures, persists and returns the whole envelope', async () => {
    const { useCase, repository } = harness();

    const run = expectSuccess(await useCase.execute(REQUEST));

    expect(run.status).toBe('completed');
    expect(run.persisted).toBe(true);
    expect(run.effective_provider).toBe('ollama');
    expect(run.results).toHaveLength(3);
    expect(run.readiness_score).not.toBeNull();
    expect(run.started_at).toBe('2026-01-01T00:00:00.000Z');

    // Three iterations, one score, and the row closed out.
    expect(repository.results).toHaveLength(3);
    expect(repository.scores).toHaveLength(1);
    expect(repository.benchmarks[0].status).toBe('completed');
    expect(repository.benchmarks[0].completedAt).not.toBeNull();
  });

  it('attributes the run to the workload owner, not to a placeholder', async () => {
    // The scaffold shipped `userId = 'temp-user-id'`. If that ever comes back,
    // every user's history collapses into one row.
    const { useCase, repository } = harness();

    await useCase.execute(REQUEST);

    expect(repository.benchmarks[0].userId).toBe(OWNER_ID);
    expect(repository.benchmarks[0].userId).not.toContain('temp');
  });

  it('stores the assumptions alongside the score, tagged', async () => {
    // A score read back out of the database months later must still say which
    // of its inputs nobody measured.
    const { useCase, repository } = harness();

    await useCase.execute(REQUEST);

    const stored = repository.scores[0].limitations.join('\n');

    expect(stored).toContain('ASSUMPTION: Hardware fit');
    expect(stored).toContain('ASSUMPTION: Cost');
  });

  it('says out loud that ownership is not coming from a session yet', async () => {
    const { useCase } = harness();

    const run = expectSuccess(await useCase.execute(REQUEST));

    expect(run.limitations.join('\n')).toContain(
      'not from an authenticated session'
    );
  });

  it('resolves the provider row and records it against the benchmark', async () => {
    const { useCase, repository } = harness({ providerId: 'row-for-ollama' });

    await useCase.execute(REQUEST);

    expect(repository.benchmarks[0].providerId).toBe('row-for-ollama');
  });
});

describe('RunBenchmark — refusing before spending anything', () => {
  it('returns 404 for a workload that does not exist, without calling a provider', async () => {
    const { useCase, providers } = harness({ workloadUserId: null });

    const outcome = await useCase.execute(REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.status).toBe(404);
    expect(outcome.error).toBe('Workload not found');
    expect(providers[0].calls).toBe(0);
  });

  it('returns 404 for a device that does not exist', async () => {
    const { useCase, providers } = harness({ deviceUserId: null });

    const outcome = await useCase.execute(REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.status).toBe(404);
    expect(outcome.error).toBe('Device not found');
    expect(providers[0].calls).toBe(0);
  });

  it('returns 403 when the workload and the device have different owners', async () => {
    // Ownership is derived from the workload, so a mismatched device would be
    // silently attributed to the wrong user. Refuse instead.
    const { useCase, providers, repository } = harness({
      deviceUserId: OTHER_OWNER_ID,
    });

    const outcome = await useCase.execute(REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.status).toBe(403);
    expect(outcome.error).toBe('Cross-owner request');
    expect(providers[0].calls).toBe(0);
    expect(repository.benchmarks).toHaveLength(0);
  });

  it('returns 404 with the seed command when the provider catalog is empty', async () => {
    const { useCase, providers } = harness({ providerId: null });

    const outcome = await useCase.execute(REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.status).toBe(404);
    expect(outcome.error).toBe('Provider not found');
    expect(outcome.detail).toContain('npm run db:seed');
    expect(providers[0].calls).toBe(0);
  });

  it('returns 503, not 500, when the database itself is unreachable', async () => {
    // A dead database is a dependency being down, not a bug in the request.
    const { useCase, providers } = harness({ throws: true });

    const outcome = await useCase.execute(REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.status).toBe(503);
    expect(outcome.error).toBe('Database unavailable');
    expect(outcome.detail).toContain('connection terminated');
    expect(providers[0].calls).toBe(0);
  });
});

describe('RunBenchmark — when the database fails mid-run', () => {
  // The use case warns rather than throws. Captured here both to keep the test
  // output readable and to assert the operator actually gets told.
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('still returns the measurement when the benchmark row cannot be created', async () => {
    // The expensive part already happened. Throwing it away would be worse
    // than reporting it as unstored.
    const repository = new InMemoryRepository();
    repository.failOn = 'create';

    const { useCase } = harness(
      {},
      [fakeProvider('ollama', () => successfulMeasurement())],
      repository
    );

    const run = expectSuccess(await useCase.execute(REQUEST));

    expect(run.persisted).toBe(false);
    expect(run.benchmark_id).toBe('not-persisted');
    expect(run.results).toHaveLength(3);
    expect(run.limitations.join('\n')).toContain('NOT written to the database');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not create the benchmark row')
    );
  });

  it('reports persisted: false when writing the results fails', async () => {
    const repository = new InMemoryRepository();
    repository.failOn = 'addResult';

    const { useCase } = harness(
      {},
      [fakeProvider('ollama', () => successfulMeasurement())],
      repository
    );

    const run = expectSuccess(await useCase.execute(REQUEST));

    expect(run.persisted).toBe(false);
    // The row was created, so the id is real even though the results are not.
    expect(run.benchmark_id).toBe('benchmark-1');
    expect(run.summary.iterations_succeeded).toBe(3);
  });

  it('does not claim persistence when only the final status update fails', async () => {
    const repository = new InMemoryRepository();
    repository.failOn = 'update';

    const { useCase } = harness(
      {},
      [fakeProvider('ollama', () => successfulMeasurement())],
      repository
    );

    const run = expectSuccess(await useCase.execute(REQUEST));

    expect(run.persisted).toBe(false);
    expect(repository.benchmarks[0].status).toBe('running');
  });
});

describe('RunBenchmark — a run where every provider failed', () => {
  it('returns ok with a failed run rather than throwing', async () => {
    // The fallback chain is the diagnosis, and it lives in the body.
    const { useCase, repository } = harness({}, [
      fakeProvider('ollama', () => failedMeasurement('local_unavailable')),
    ]);

    const run = expectSuccess(await useCase.execute(REQUEST));

    expect(run.status).toBe('failed');
    expect(run.effective_provider).toBeNull();
    expect(run.readiness_score).toBeNull();
    expect(run.fallback_chain[0].error_code).toBe('local_unavailable');

    // A failed run is still recorded, and no readiness score is invented.
    expect(repository.benchmarks[0].status).toBe('failed');
    expect(repository.scores).toHaveLength(0);
  });

  it('maps the terminal error code to an HTTP status', async () => {
    const { useCase } = harness({}, [
      fakeProvider('ollama', () => failedMeasurement('local_unavailable')),
    ]);

    const run = expectSuccess(await useCase.execute(REQUEST));

    // 503: the local service is not running. Retrying later may work.
    expect(statusForFailedRun(run)).toBe(503);
  });

  it('maps an unknown model to a client error, not a server error', async () => {
    const { useCase } = harness({}, [
      fakeProvider('ollama', () => failedMeasurement('invalid_model')),
    ]);

    const run = expectSuccess(await useCase.execute(REQUEST));

    // 422, not 400: the request was well-formed, it just named a model the
    // provider does not have. 400 would tell the caller to fix their JSON.
    expect(statusForFailedRun(run)).toBe(422);
  });

  it('falls back to 502 when there is no code to map', async () => {
    const run = {
      fallback_chain: [
        { provider: 'ollama', outcome: 'failed', error_code: null, detail: '' },
      ],
    } as unknown as BenchmarkRun;

    expect(statusForFailedRun(run)).toBe(502);
  });
});
