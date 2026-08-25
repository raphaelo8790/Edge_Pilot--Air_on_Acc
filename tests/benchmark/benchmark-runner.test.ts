/**
 * The runner's only real decision is when to fall back, so that is what these
 * tests are mostly about. The rule it implements, in one sentence: fall back
 * only when the provider failed for a reason another provider could plausibly
 * not share.
 */

import { BenchmarkRunner } from '@/modules/benchmark/application/services/BenchmarkRunner';
import { ReadinessCalculator } from '@/modules/benchmark/core/services/ReadinessCalculator';
import {
  failedMeasurement,
  fakeProvider,
  stubRegistry,
  successfulMeasurement,
} from './helpers';

function runnerFor(chain: ReturnType<typeof fakeProvider>[]) {
  return new BenchmarkRunner(stubRegistry(chain), new ReadinessCalculator());
}

const REQUEST = {
  provider: 'ollama',
  model: 'llama3.2:1b',
  prompt: 'hi',
  iterations: 3,
};

describe('BenchmarkRunner — a run that works', () => {
  it('accepts the requested provider and does not touch the rest of the chain', async () => {
    const ollama = fakeProvider('ollama', () => successfulMeasurement());
    const groq = fakeProvider('groq', () => successfulMeasurement(), {
      type: 'cloud',
      privacyLevel: 'low',
    });

    const outcome = await runnerFor([ollama, groq]).run(REQUEST);

    expect(outcome.effectiveProvider).toBe('ollama');
    expect(outcome.fallbackUsed).toBe(false);
    expect(groq.calls).toBe(0);
    expect(outcome.results).toHaveLength(3);
    expect(outcome.fallbackChain).toEqual([
      {
        provider: 'ollama',
        outcome: 'succeeded',
        error_code: null,
        detail: '3/3 iterations succeeded.',
      },
    ]);
  });

  it('reports a score that agrees with the shared readiness calculator', async () => {
    const ollama = fakeProvider('ollama', () =>
      successfulMeasurement({ latency_ms: 100 })
    );

    const outcome = await runnerFor([ollama]).run(REQUEST);

    expect(outcome.readinessBreakdown).not.toBeNull();

    // The runner recomputes the breakdown only to display it. If the two ever
    // disagree, the number on the dashboard stops matching the number in the
    // database, and this is the test that catches it.
    const recomputed = new ReadinessCalculator().calculate({
      hardwareFit: outcome.readinessBreakdown!.hardwareFit,
      latencyMs: outcome.summary.latency_ms_mean ?? 0,
      privacyLevel: 'high',
      estimatedCost: 0,
      reliabilityScore: outcome.summary.success_rate_percent,
    });

    expect(outcome.readinessScore).toBe(recomputed);
  });

  it('marks every unmeasured input to the score as an assumption', async () => {
    const outcome = await runnerFor([
      fakeProvider('ollama', () => successfulMeasurement()),
    ]).run(REQUEST);

    const assumptions = outcome.assumptions.join('\n');

    expect(assumptions).toContain('Hardware fit');
    expect(assumptions).toContain('Cost');
    expect(assumptions).toContain('privacy score');
    expect(outcome.evidence.join('\n')).toContain('measured');
  });

  it('says the latency figure is specific to this machine', async () => {
    const outcome = await runnerFor([
      fakeProvider('ollama', () => successfulMeasurement()),
    ]).run(REQUEST);

    expect(outcome.limitations.join('\n')).toContain(
      'measured from this server'
    );
  });
});

describe('BenchmarkRunner — falling back', () => {
  it('falls back after a retryable failure', async () => {
    const ollama = fakeProvider('ollama', () =>
      failedMeasurement('local_unavailable')
    );
    const groq = fakeProvider('groq', () => successfulMeasurement(), {
      type: 'cloud',
      privacyLevel: 'low',
    });

    const outcome = await runnerFor([ollama, groq]).run(REQUEST);

    expect(outcome.effectiveProvider).toBe('groq');
    expect(outcome.fallbackUsed).toBe(true);
    expect(groq.calls).toBe(1);
    expect(outcome.fallbackChain.map((a) => a.outcome)).toEqual([
      'failed',
      'succeeded',
    ]);
    expect(outcome.fallbackChain[0].error_code).toBe('local_unavailable');
  });

  it('falls back after a timeout', async () => {
    const ollama = fakeProvider('ollama', () => failedMeasurement('timeout'));
    const groq = fakeProvider('groq', () => successfulMeasurement(), {
      type: 'cloud',
      privacyLevel: 'low',
    });

    const outcome = await runnerFor([ollama, groq]).run(REQUEST);

    expect(outcome.effectiveProvider).toBe('groq');
  });

  it('does NOT fall back on an unknown model', async () => {
    // A different provider would not make the model name correct, and the
    // caller asked to measure THAT model on THAT provider.
    const ollama = fakeProvider('ollama', () =>
      failedMeasurement('invalid_model')
    );
    const groq = fakeProvider('groq', () => successfulMeasurement());

    const outcome = await runnerFor([ollama, groq]).run(REQUEST);

    expect(outcome.effectiveProvider).toBeNull();
    expect(groq.calls).toBe(0);
    expect(outcome.terminalErrorCode).toBe('invalid_model');
  });

  it('does NOT fall back on a rejected credential', async () => {
    // Falling back would hide a configuration fault behind a working answer.
    const gemini = fakeProvider('gemini', () =>
      failedMeasurement('unauthorized')
    );
    const groq = fakeProvider('groq', () => successfulMeasurement());

    const outcome = await runnerFor([gemini, groq]).run({
      ...REQUEST,
      provider: 'gemini',
    });

    expect(outcome.effectiveProvider).toBeNull();
    expect(groq.calls).toBe(0);
    expect(outcome.terminalErrorCode).toBe('unauthorized');
  });

  it('accepts a partially successful provider rather than falling back', async () => {
    // One failure out of three is a reliability figure, not a reason to
    // measure a different provider instead.
    let call = 0;
    const ollama = fakeProvider('ollama', () => {
      call += 1;
      return call === 2
        ? failedMeasurement('timeout')
        : successfulMeasurement();
    });
    const groq = fakeProvider('groq', () => successfulMeasurement());

    const outcome = await runnerFor([ollama, groq]).run(REQUEST);

    expect(outcome.effectiveProvider).toBe('ollama');
    expect(groq.calls).toBe(0);
    expect(outcome.summary.iterations_succeeded).toBe(2);
    expect(outcome.summary.success_rate_percent).toBeCloseTo(66.67, 1);
    expect(outcome.limitations.join('\n')).toContain('1 of 3 iterations failed');
  });
});

describe('BenchmarkRunner — when nothing works', () => {
  it('issues no recommendation and no score', async () => {
    const ollama = fakeProvider('ollama', () =>
      failedMeasurement('local_unavailable')
    );
    const groq = fakeProvider('groq', () => failedMeasurement('timeout'));

    const outcome = await runnerFor([ollama, groq]).run(REQUEST);

    expect(outcome.effectiveProvider).toBeNull();
    expect(outcome.readinessScore).toBeNull();
    expect(outcome.readinessBreakdown).toBeNull();
    expect(outcome.recommendation).toContain('No recommendation');
    expect(outcome.results).toEqual([]);
    expect(outcome.summary.latency_ms_mean).toBeNull();
    expect(outcome.terminalErrorCode).toBe('timeout');
  });

  it('keeps the whole chain in the response, because that is the diagnosis', async () => {
    const outcome = await runnerFor([
      fakeProvider('ollama', () => failedMeasurement('local_unavailable')),
      fakeProvider('groq', () => failedMeasurement('rate_limited')),
    ]).run(REQUEST);

    expect(outcome.fallbackChain.map((a) => a.error_code)).toEqual([
      'local_unavailable',
      'rate_limited',
    ]);
  });

  it('records a skipped attempt when nothing at all is configured', async () => {
    const outcome = await runnerFor([]).run(REQUEST);

    expect(outcome.effectiveProvider).toBeNull();
    expect(outcome.terminalErrorCode).toBe('not_configured');
    expect(outcome.fallbackChain[0].outcome).toBe('skipped');
  });
});

describe('BenchmarkRunner — the simulator', () => {
  it('refuses to make a recommendation out of simulated figures', async () => {
    const demo = fakeProvider('demo', () => successfulMeasurement());

    const outcome = await runnerFor([demo]).run({
      ...REQUEST,
      provider: 'demo',
    });

    expect(outcome.simulated).toBe(true);
    expect(outcome.recommendation).toContain('No recommendation');
    expect(outcome.limitations[0]).toContain('SIMULATED RUN');
    expect(outcome.assumptions.join('\n')).toContain(
      'None of it is a measurement'
    );
  });
});
