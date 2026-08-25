/**
 * The route's job is narrow: parse, dispatch, pick a status code. The single
 * most important thing it does is REFUSE — a malformed body must be rejected
 * before anything constructs a provider, because a provider call costs money,
 * quota and up to five minutes.
 *
 * The composition root is mocked, so nothing here touches Prisma or the
 * network.
 */

import type { BenchmarkRun } from '@/modules/benchmark/application/dtos/BenchmarkMeasurement';
import type { RunBenchmarkOutcome } from '@/modules/benchmark/application/use-cases/RunBenchmark';

const execute = jest.fn<Promise<RunBenchmarkOutcome>, [unknown]>();
const runBenchmarkUseCase = jest.fn(() => ({ execute }));

const repository = {
  findById: jest.fn(),
  findByUserId: jest.fn(),
  getResults: jest.fn(),
  getReadinessScore: jest.fn(),
};

const benchmarkRepository = jest.fn(() => repository);

jest.mock('@/modules/benchmark/infrastructure/container', () => ({
  runBenchmarkUseCase: () => runBenchmarkUseCase(),
  benchmarkRepository: () => benchmarkRepository(),
}));

// Imported after the mock is registered.
import { GET, POST } from '@/app/api/v1/benchmarks/route';

const WORKLOAD_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const VALID_BODY = {
  workload_id: WORKLOAD_ID,
  device_id: DEVICE_ID,
  provider: 'ollama',
  model: 'llama3.2:1b',
  prompt: 'hi',
  iterations: 3,
};

function postRequest(body: unknown, raw?: string): Request {
  return new Request('http://localhost:3000/api/v1/benchmarks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

function getRequest(query = ''): Request {
  return new Request(`http://localhost:3000/api/v1/benchmarks${query}`);
}

function completedRun(overrides: Partial<BenchmarkRun> = {}): BenchmarkRun {
  return {
    benchmark_id: 'benchmark-1',
    status: 'completed',
    requested_provider: 'ollama',
    effective_provider: 'ollama',
    model: 'llama3.2:1b',
    fallback_used: false,
    fallback_chain: [],
    simulated: false,
    results: [],
    summary: {
      iterations_requested: 3,
      iterations_run: 3,
      iterations_succeeded: 3,
      success_rate_percent: 100,
      latency_ms_mean: 100,
      latency_ms_min: 90,
      latency_ms_max: 110,
      latency_ms_p50: 100,
      latency_ms_p95: 110,
      ttft_ms_mean: 20,
      tokens_per_second_mean: 50,
      output_tokens_total: 75,
      input_tokens_total: 15,
    },
    readiness_score: 72,
    recommendation: 'Recommended on ollama',
    evidence: [],
    assumptions: [],
    limitations: [],
    persisted: true,
    started_at: '2026-01-01T00:00:00.000Z',
    completed_at: '2026-01-01T00:00:01.000Z',
    ...overrides,
  } as BenchmarkRun;
}

beforeEach(() => {
  execute.mockReset();
  runBenchmarkUseCase.mockClear();
  benchmarkRepository.mockClear();

  for (const fn of Object.values(repository)) {
    fn.mockReset();
  }
});

describe('POST /api/v1/benchmarks — validation', () => {
  it('rejects a malformed body without constructing anything', async () => {
    // This is the test that proves an invalid request costs nothing. If the
    // container is touched, an adapter is built and a key is read.
    const response = await POST(postRequest({ provider: 'ollama' }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Validation error');
    expect(runBenchmarkUseCase).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON at all', async () => {
    const response = await POST(postRequest(null, 'not json'));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.details).toContain('not valid JSON');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a provider outside the documented set', async () => {
    const response = await POST(
      postRequest({ ...VALID_BODY, provider: 'openai' })
    );

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects an iteration count that would run for hours', async () => {
    const response = await POST(
      postRequest({ ...VALID_BODY, iterations: 5000 })
    );

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid workload id', async () => {
    const response = await POST(
      postRequest({ ...VALID_BODY, workload_id: 'workload-1' })
    );

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/benchmarks — dispatch', () => {
  it('returns the run on success', async () => {
    execute.mockResolvedValue({ ok: true, run: completedRun() });

    const response = await POST(postRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.readiness_score).toBe(72);
    expect(execute).toHaveBeenCalledWith(VALID_BODY);
  });

  it('passes the use case status straight through', async () => {
    execute.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Cross-owner request',
      detail: 'different users',
    });

    const response = await POST(postRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Cross-owner request');
  });

  it('returns the failed run in the body so the chain is visible', async () => {
    // A 503 with an empty body tells an operator nothing. The fallback chain
    // is the diagnosis and it must survive the error path.
    execute.mockResolvedValue({
      ok: true,
      run: completedRun({
        status: 'failed',
        effective_provider: null,
        readiness_score: null,
        fallback_chain: [
          {
            provider: 'ollama',
            outcome: 'failed',
            error_code: 'local_unavailable',
            detail: 'Connection refused at http://localhost:11434.',
          },
        ],
      }),
    });

    const response = await POST(postRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('All providers failed');
    expect(payload.data.fallback_chain[0].error_code).toBe('local_unavailable');
  });

  it('turns an unexpected throw into a 500 without leaking the stack', async () => {
    execute.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.4:5432 secret'));

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await POST(postRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe('Internal server error');
    expect(JSON.stringify(payload)).not.toContain('10.0.0.4');

    consoleError.mockRestore();
  });
});

describe('GET /api/v1/benchmarks', () => {
  it('refuses to list every benchmark when no owner is given', async () => {
    // Without a session there is no "current user", and returning the whole
    // table would hand one user everybody else's runs.
    const response = await GET(getRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([]);
    expect(payload.message).toContain('user_id');
    expect(repository.findByUserId).not.toHaveBeenCalled();
  });

  it('lists one owner’s benchmarks', async () => {
    repository.findByUserId.mockResolvedValue([{ id: 'benchmark-1' }]);

    const response = await GET(getRequest(`?user_id=${USER_ID}`));
    const payload = await response.json();

    expect(repository.findByUserId).toHaveBeenCalledWith(USER_ID);
    expect(payload.data).toHaveLength(1);
  });

  it('returns one benchmark with its results and score', async () => {
    repository.findById.mockResolvedValue({ id: WORKLOAD_ID });
    repository.getResults.mockResolvedValue([{ iteration: 1 }]);
    repository.getReadinessScore.mockResolvedValue({ overallReadiness: 72 });

    const response = await GET(getRequest(`?benchmark_id=${WORKLOAD_ID}`));
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.data.results).toHaveLength(1);
    expect(payload.data.readiness.overallReadiness).toBe(72);
  });

  it('returns 404 for a benchmark that does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    const response = await GET(getRequest(`?benchmark_id=${WORKLOAD_ID}`));

    expect(response.status).toBe(404);
  });

  it('rejects a non-uuid query parameter', async () => {
    const response = await GET(getRequest('?benchmark_id=abc'));

    expect(response.status).toBe(400);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('returns 500 when the repository throws', async () => {
    repository.findByUserId.mockRejectedValue(new Error('database is down'));

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await GET(getRequest(`?user_id=${USER_ID}`));

    expect(response.status).toBe(500);

    consoleError.mockRestore();
  });
});
