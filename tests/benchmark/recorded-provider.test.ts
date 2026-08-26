/**
 * A browser-recorded run must come out of the runner looking exactly like a
 * server-measured one: same cold-start isolation, same summary, and the
 * residency readings the browser took where the server's probe would be.
 */

import { BenchmarkRunner } from '@/modules/benchmark/application/services/BenchmarkRunner';
import { ReadinessCalculator } from '@/modules/benchmark/core/services/ReadinessCalculator';
import {
  BenchmarkRequestSchema,
  type RecordedMeasurement,
} from '@/modules/benchmark/application/dtos/BenchmarkRequest';
import {
  RecordedProvider,
  recordedChain,
} from '@/modules/benchmark/infrastructure/providers/RecordedProvider';
import { failedMeasurement, successfulMeasurement } from './helpers';

function recording(overrides: Partial<RecordedMeasurement> = {}): RecordedMeasurement {
  return {
    host: 'http://localhost:11434',
    responses: [
      successfulMeasurement({ latency_ms: 900 }), // cold start
      successfulMeasurement({ latency_ms: 100 }),
      successfulMeasurement({ latency_ms: 120 }),
      successfulMeasurement({ latency_ms: 110 }),
    ],
    resident_before: { modelBytesOnDisk: 2_000_000_000, residentBytes: null, vramBytes: null },
    resident_after: {
      modelBytesOnDisk: 2_000_000_000,
      residentBytes: 2_400_000_000,
      vramBytes: 2_400_000_000,
    },
    ...overrides,
  };
}

function runnerFor(recorded: RecordedMeasurement) {
  const provider = new RecordedProvider(recorded);
  const probe = provider.residencyProbe();
  return new BenchmarkRunner(recordedChain(provider), new ReadinessCalculator(), () =>
    probe()
  );
}

const REQUEST = { provider: 'ollama', model: 'llama3.2:1b', prompt: 'hi', iterations: 3 };

describe('RecordedProvider through BenchmarkRunner', () => {
  it('scores the recording as an ollama run with the first call discarded as cold start', async () => {
    const outcome = await runnerFor(recording()).run(REQUEST);

    expect(outcome.effectiveProvider).toBe('ollama');
    expect(outcome.fallbackUsed).toBe(false);
    expect(outcome.results.map((r) => r.latency_ms)).toEqual([100, 120, 110]);
    expect(outcome.coldStart?.latency_ms).toBe(900);
    expect(outcome.privacy?.privacyClass).toBe('on-device');
  });

  it('uses the residency the browser observed, not a server probe', async () => {
    const outcome = await runnerFor(recording()).run(REQUEST);

    // Not resident before, resident after: the run paid the load, and the
    // runner can only know that from the readings handed to it.
    expect(outcome.hardware?.residentBytes).toBe(2_400_000_000);
    expect(outcome.coldStart?.model_was_resident_before).toBe(false);
    expect(outcome.coldStart?.note).toContain('not loaded when this run started');
  });

  it('does not fall back to a cloud provider when the local run failed', async () => {
    const outcome = await runnerFor(
      recording({
        responses: [
          failedMeasurement('local_unavailable'),
          failedMeasurement('local_unavailable'),
          failedMeasurement('local_unavailable'),
          failedMeasurement('local_unavailable'),
        ],
      })
    ).run(REQUEST);

    expect(outcome.effectiveProvider).toBeNull();
    expect(outcome.fallbackChain.map((a) => a.provider)).toEqual(['ollama']);
    expect(outcome.terminalErrorCode).toBe('local_unavailable');
  });
});

describe('BenchmarkRequestSchema with a recording', () => {
  const base = {
    workload_id: '11111111-1111-4111-8111-111111111111',
    model: 'llama3.2:1b',
    prompt: 'hi',
    iterations: 3,
  };

  it('accepts an ollama recording of iterations + 1 responses', () => {
    const parsed = BenchmarkRequestSchema.safeParse({
      ...base,
      provider: 'ollama',
      recorded: recording(),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a recording for a cloud provider', () => {
    const parsed = BenchmarkRequestSchema.safeParse({
      ...base,
      provider: 'groq',
      recorded: recording(),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a recording whose length disagrees with iterations', () => {
    const parsed = BenchmarkRequestSchema.safeParse({
      ...base,
      provider: 'ollama',
      iterations: 5,
      recorded: recording(),
    });
    expect(parsed.success).toBe(false);
  });
});
