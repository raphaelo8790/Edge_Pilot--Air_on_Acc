import { RunComparison } from '../../src/modules/benchmark/application/use-cases/RunComparison';

/**
 * The orchestration is the risky part: whether entrants really do run one at
 * a time when the plan says sequential. These stubs record concurrency
 * directly rather than inferring it from timings.
 */

type Kind = 'local' | 'cloud';

function stubRegistry(types: Record<string, Kind>) {
  return {
    has: (name: string) => name in types,
    get: (name: string) =>
      name in types
        ? { describe: () => ({ name, type: types[name] }) }
        : null,
  } as never;
}

function stubRunnerFactory(tracker: { active: number; maxActive: number; order: string[] }) {
  return () => ({
    async run(request: { provider: string; model: string }) {
      tracker.active += 1;
      tracker.maxActive = Math.max(tracker.maxActive, tracker.active);
      tracker.order.push(`${request.provider}/${request.model}`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      tracker.active -= 1;

      return {
        results: [
          { latency_ms: 100, ttft_ms: 20, tokens_per_second: 40 },
          { latency_ms: 100, ttft_ms: 20, tokens_per_second: 40 },
        ],
        summary: { success_rate_percent: 100 },
        readinessScore: 70,
        hardware: { score: 100 },
        privacy: { privacyClass: 'on-device', disqualifies: [] },
      };
    },
  }) as never;
}

function tracker() {
  return { active: 0, maxActive: 0, order: [] as string[] };
}

describe('RunComparison', () => {
  it('refuses fewer than two entrants', async () => {
    const t = tracker();
    const result = await new RunComparison({
      registry: stubRegistry({ ollama: 'local' }),
      createRunner: stubRunnerFactory(t),
      createRecordedRunner: () => stubRunnerFactory(t)(),
    }).execute({
      entrants: [{ provider: 'ollama', model: 'a', families: ['llama'] }],
      prompt: 'hi',
      iterations: 1,
    });

    expect(result.ok).toBe(false);
    expect(t.order).toHaveLength(0);
  });

  it('refuses an unregistered provider before running anything', async () => {
    const t = tracker();
    const result = await new RunComparison({
      registry: stubRegistry({ ollama: 'local' }),
      createRunner: stubRunnerFactory(t),
      createRecordedRunner: () => stubRunnerFactory(t)(),
    }).execute({
      entrants: [
        { provider: 'ollama', model: 'a', families: ['llama'] },
        { provider: 'nope', model: 'b', families: ['llama'] },
      ],
      prompt: 'hi',
      iterations: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
    expect(t.order).toHaveLength(0);
  });

  it('refuses a mismatched modality without running anything', async () => {
    const t = tracker();
    const result = await new RunComparison({
      registry: stubRegistry({ ollama: 'local' }),
      createRunner: stubRunnerFactory(t),
      createRecordedRunner: () => stubRunnerFactory(t)(),
    }).execute({
      entrants: [
        { provider: 'ollama', model: 'mistral:7b', families: ['llama'] },
        { provider: 'ollama', model: 'bge-m3:latest', families: ['bert'] },
      ],
      prompt: 'hi',
      iterations: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.plan).not.toBeNull();
    }
    // Nothing ran: a refused comparison must not burn a GPU first.
    expect(t.order).toHaveLength(0);
  });

  it('never runs two local entrants at the same time', async () => {
    const t = tracker();
    const result = await new RunComparison({
      registry: stubRegistry({ ollama: 'local' }),
      createRunner: stubRunnerFactory(t),
      createRecordedRunner: () => stubRunnerFactory(t)(),
    }).execute({
      entrants: [
        { provider: 'ollama', model: 'mistral:7b', families: ['llama'] },
        { provider: 'ollama', model: 'llama3.2:latest', families: ['llama'] },
      ],
      prompt: 'hi',
      iterations: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.mode).toBe('sequential');
    }
    // The assertion that matters: peak concurrency was one.
    expect(t.maxActive).toBe(1);
    expect(t.order).toEqual(['ollama/mistral:7b', 'ollama/llama3.2:latest']);
  });

  it('runs local against cloud concurrently', async () => {
    const t = tracker();
    const result = await new RunComparison({
      registry: stubRegistry({ ollama: 'local', gemini: 'cloud' }),
      createRunner: stubRunnerFactory(t),
      createRecordedRunner: () => stubRunnerFactory(t)(),
    }).execute({
      entrants: [
        { provider: 'ollama', model: 'mistral:7b', families: ['llama'] },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
      ],
      prompt: 'hi',
      iterations: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.mode).toBe('parallel');
    }
    expect(t.maxActive).toBe(2);
  });

  it('produces a report over the runs it performed', async () => {
    const t = tracker();
    const result = await new RunComparison({
      registry: stubRegistry({ ollama: 'local' }),
      createRunner: stubRunnerFactory(t),
      createRecordedRunner: () => stubRunnerFactory(t)(),
    }).execute({
      entrants: [
        { provider: 'ollama', model: 'mistral:7b', families: ['llama'] },
        { provider: 'ollama', model: 'llama3.2:latest', families: ['llama'] },
      ],
      prompt: 'hi',
      iterations: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcomes).toHaveLength(2);
      expect(result.report.dimensions.length).toBeGreaterThan(0);
      // Identical stub figures: nothing should be declared established.
      expect(result.report.overall.winner).toBeNull();
    }
  });
});
