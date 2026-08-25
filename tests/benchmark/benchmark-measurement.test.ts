/**
 * The summary is where a number gets invented if anywhere does. These tests
 * are about what it refuses to report.
 */

import {
  MeasuredIterationSchema,
  summarise,
  type MeasuredIteration,
} from '@/modules/benchmark/application/dtos/BenchmarkMeasurement';

function iteration(
  overrides: Partial<MeasuredIteration> = {}
): MeasuredIteration {
  return {
    iteration: 1,
    provider: 'ollama',
    model: 'llama3.2:1b',
    latency_ms: 100,
    ttft_ms: 20,
    tokens_per_second: 50,
    output_tokens: 25,
    input_tokens: 5,
    success: true,
    error_code: null,
    error_message: null,
    provenance: {
      latency_ms: 'measured',
      ttft_ms: 'measured',
      tokens_per_second: 'derived',
      output_tokens: 'measured',
    },
    ...overrides,
  };
}

describe('summarise', () => {
  it('reports null, not zero, when nothing succeeded', () => {
    // Reporting 0 ms for "we never got an answer" is the single most
    // misleading number this system could produce.
    const summary = summarise(
      [iteration({ success: false, latency_ms: 5, error_code: 'timeout' })],
      3
    );

    expect(summary.latency_ms_mean).toBeNull();
    expect(summary.latency_ms_min).toBeNull();
    expect(summary.ttft_ms_mean).toBeNull();
    expect(summary.tokens_per_second_mean).toBeNull();
    expect(summary.output_tokens_total).toBeNull();
    expect(summary.success_rate_percent).toBe(0);
  });

  it('aggregates only the successful iterations', () => {
    const summary = summarise(
      [
        iteration({ iteration: 1, latency_ms: 100 }),
        iteration({ iteration: 2, latency_ms: 200 }),
        iteration({
          iteration: 3,
          success: false,
          latency_ms: 9999,
          ttft_ms: null,
          tokens_per_second: null,
          output_tokens: null,
        }),
      ],
      3
    );

    // 9999 ms of failure must not drag the mean of the two that worked.
    expect(summary.latency_ms_mean).toBe(150);
    expect(summary.latency_ms_min).toBe(100);
    expect(summary.latency_ms_max).toBe(200);
    expect(summary.iterations_succeeded).toBe(2);
    expect(summary.success_rate_percent).toBeCloseTo(66.67, 1);
    expect(summary.output_tokens_total).toBe(50);
  });

  it('withholds a median below three samples', () => {
    // With two points a percentile says nothing that min and max do not.
    const two = summarise(
      [iteration({ iteration: 1 }), iteration({ iteration: 2 })],
      2
    );

    expect(two.latency_ms_p50).toBeNull();

    const three = summarise(
      [
        iteration({ iteration: 1, latency_ms: 100 }),
        iteration({ iteration: 2, latency_ms: 200 }),
        iteration({ iteration: 3, latency_ms: 300 }),
      ],
      3
    );

    expect(three.latency_ms_p50).toBe(200);
  });

  it('keeps the requested count even when fewer iterations ran', () => {
    const summary = summarise([iteration()], 5);

    expect(summary.iterations_requested).toBe(5);
    expect(summary.iterations_run).toBe(1);
  });

  it('averages only the iterations that actually reported a figure', () => {
    const summary = summarise(
      [
        iteration({ iteration: 1, ttft_ms: 20, tokens_per_second: 50 }),
        iteration({ iteration: 2, ttft_ms: null, tokens_per_second: null }),
      ],
      2
    );

    // The second iteration succeeded but reported no TTFT; it must not be
    // counted as a zero.
    expect(summary.ttft_ms_mean).toBe(20);
    expect(summary.tokens_per_second_mean).toBe(50);
  });
});

describe('MeasuredIterationSchema', () => {
  it('accepts a well-formed iteration', () => {
    expect(MeasuredIterationSchema.safeParse(iteration()).success).toBe(true);
  });

  it('rejects a negative latency', () => {
    expect(
      MeasuredIterationSchema.safeParse(iteration({ latency_ms: -1 })).success
    ).toBe(false);
  });

  it('rejects an undocumented error code', () => {
    const bad = {
      ...iteration(),
      error_code: 'kaboom',
    };

    expect(MeasuredIterationSchema.safeParse(bad).success).toBe(false);
  });
});
