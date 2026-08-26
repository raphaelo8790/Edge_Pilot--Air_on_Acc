import {
  classifyModality,
  checkModalityCompatibility,
} from '../../src/modules/benchmark/core/services/ModelModality';
import { planComparison } from '../../src/modules/benchmark/core/services/ComparisonPlanner';
import {
  buildComparisonReport,
  type ComparisonEntrantResult,
} from '../../src/modules/benchmark/core/services/ComparisonReport';

function result(
  label: string,
  overrides: Partial<ComparisonEntrantResult> = {}
): ComparisonEntrantResult {
  return {
    label,
    latencySamples: [980, 1000, 1020],
    ttftSamples: [295, 300, 305],
    throughputSamples: [49, 50, 51],
    successRatePercent: 100,
    hardwareFit: 100,
    parametersBillions: 7,
    residentBytes: 5_000_000_000,
    privacyClass: 'on-device',
    privacyDisqualifies: [],
    readinessScore: 80,
    ...overrides,
  };
}

describe('classifyModality', () => {
  it('identifies embedding models from the family the runtime reports', () => {
    // Verified against a live runtime: these are the real reported families.
    expect(classifyModality('bge-m3:latest', ['bert']).modality).toBe('embedding');
    expect(
      classifyModality('nomic-embed-text:latest', ['nomic-bert']).modality
    ).toBe('embedding');
    expect(classifyModality('bge-m3:latest', ['bert']).confidence).toBe('reported');
  });

  it('identifies vision models from a projector family', () => {
    const verdict = classifyModality('llava:7b', ['llama', 'clip']);

    expect(verdict.modality).toBe('vision');
    expect(verdict.confidence).toBe('reported');
  });

  it('treats generative families as text, and labels that an inference', () => {
    for (const family of ['llama', 'cohere2', 'qwen2']) {
      const verdict = classifyModality(`x:${family}`, [family]);
      expect(verdict.modality).toBe('text');
      expect(verdict.confidence).toBe('inferred');
    }
  });

  it('falls back to the name when no family is reported', () => {
    const verdict = classifyModality('some-embed-model:latest', []);

    expect(verdict.modality).toBe('embedding');
    expect(verdict.confidence).toBe('inferred');
  });
});

describe('checkModalityCompatibility', () => {
  it('refuses to compare a text model with an embedding model', () => {
    const check = checkModalityCompatibility([
      { model: 'mistral:7b', verdict: classifyModality('mistral:7b', ['llama']) },
      { model: 'bge-m3:latest', verdict: classifyModality('bge-m3:latest', ['bert']) },
    ]);

    expect(check.compatible).toBe(false);
    expect(check.reason).toContain('do not do the same kind of work');
  });

  it('needs at least two entrants', () => {
    const check = checkModalityCompatibility([
      { model: 'a', verdict: classifyModality('a', ['llama']) },
    ]);

    expect(check.compatible).toBe(false);
  });
});

describe('planComparison', () => {
  it('refuses the same model entered twice', () => {
    // Entrants are labelled provider+model and the report's tally is keyed by
    // that label, so a duplicate collides onto one key and the comparison
    // would declare a winner between a model and itself.
    const plan = planComparison([
      { provider: 'ollama', providerType: 'local', model: 'llama3.2:latest', families: ['llama'] },
      { provider: 'ollama', providerType: 'local', model: 'llama3.2:latest', families: ['llama'] },
    ]);

    expect(plan.runnable).toBe(false);
    expect(plan.refusal).toMatch(/more than once/i);
  });

  it('allows two different tags of the same family', () => {
    // The rule is about identity, not similarity: 1b and 3b are a legitimate
    // comparison and must not be caught by it.
    const plan = planComparison([
      { provider: 'ollama', providerType: 'local', model: 'llama3.2:1b', families: ['llama'] },
      { provider: 'ollama', providerType: 'local', model: 'llama3.2:3b', families: ['llama'] },
    ]);

    expect(plan.runnable).toBe(true);
  });

  it('runs two local models sequentially and explains why', () => {
    const plan = planComparison([
      { provider: 'ollama', providerType: 'local', model: 'mistral:7b', families: ['llama'] },
      { provider: 'ollama', providerType: 'local', model: 'llama3.2:latest', families: ['llama'] },
    ]);

    expect(plan.runnable).toBe(true);
    expect(plan.mode).toBe('sequential');
    expect(plan.modeReason).toContain('compete for the same');
  });

  it('runs local against cloud together', () => {
    const plan = planComparison([
      { provider: 'ollama', providerType: 'local', model: 'mistral:7b', families: ['llama'] },
      { provider: 'gemini', providerType: 'cloud', model: 'gemini-2.0-flash' },
    ]);

    expect(plan.mode).toBe('parallel');
    expect(plan.caveats.join(' ')).toContain('Network round-trip');
  });

  it('warns when two entrants share one cloud account', () => {
    const plan = planComparison([
      { provider: 'groq', providerType: 'cloud', model: 'a' },
      { provider: 'groq', providerType: 'cloud', model: 'b' },
    ]);

    expect(plan.mode).toBe('parallel');
    expect(plan.caveats.join(' ')).toContain('rate limit');
  });

  it('refuses a mismatched pair before deciding a mode', () => {
    const plan = planComparison([
      { provider: 'ollama', providerType: 'local', model: 'mistral:7b', families: ['llama'] },
      { provider: 'ollama', providerType: 'local', model: 'bge-m3:latest', families: ['bert'] },
    ]);

    expect(plan.runnable).toBe(false);
    expect(plan.refusal).toContain('same kind of work');
  });
});

describe('buildComparisonReport', () => {
  it('declares no winner when the observed ranges overlap', () => {
    const report = buildComparisonReport([
      result('A', { latencySamples: [690, 850, 1150] }),
      result('B', { latencySamples: [700, 900, 1200] }),
    ]);

    const latency = report.dimensions.find((d) => d.dimension === 'latency')!;

    expect(latency.established).toBe(false);
    expect(latency.winner).toBeNull();
    expect(latency.note).toContain('ranges overlap');
  });

  it('declares a winner when the ranges are clearly apart', () => {
    const report = buildComparisonReport([
      result('fast', { latencySamples: [380, 400, 420] }),
      result('slow', { latencySamples: [1100, 1200, 1300] }),
    ]);

    const latency = report.dimensions.find((d) => d.dimension === 'latency')!;

    expect(latency.established).toBe(true);
    expect(latency.winner).toBe('fast');
    expect(latency.margin).toContain('%');
  });

  it('separates "buried in noise" from "close call"', () => {
    // Real shape: latency varying 1653-7662 within one model against a 430 ms
    // difference between models. More iterations will never fix that.
    const noisy = buildComparisonReport([
      result('A', { latencySamples: [1653, 2510, 7662] }),
      result('B', { latencySamples: [1355, 2080, 7635] }),
    ]);
    const noisyLatency = noisy.dimensions.find((d) => d.dimension === 'latency')!;

    expect(noisyLatency.code).toBe('overlap-indistinguishable');
    expect(noisyLatency.separability!).toBeLessThan(0.15);
    expect(noisyLatency.note).toContain('will not separate them');
    expect(noisy.methodNotes.join(' ')).toContain('varied more between runs of the same model');

    // Tight spreads, a gap that nearly clears them: worth more data.
    const close = buildComparisonReport([
      result('A', { latencySamples: [1000, 1010, 1020] }),
      result('B', { latencySamples: [1015, 1025, 1035] }),
    ]);
    const closeLatency = close.dimensions.find((d) => d.dimension === 'latency')!;

    expect(closeLatency.code).toBe('overlap-close');
    expect(closeLatency.note).toContain('would likely settle it');
  });

  it('checks ranges for throughput and time-to-first-token too', () => {
    const report = buildComparisonReport([
      result('A', { throughputSamples: [40, 50, 60] }),
      result('B', { throughputSamples: [45, 55, 65] }),
    ]);

    const throughput = report.dimensions.find((d) => d.dimension === 'throughput')!;

    expect(throughput.established).toBe(false);
    expect(throughput.note).toContain('ranges overlap');
  });

  it('refuses to call readiness established when its inputs were not', () => {
    // Latency ranges overlap, hardware and reliability are identical. The
    // readiness gap is therefore nothing but the unproven latency gap.
    const report = buildComparisonReport([
      result('A', { latencySamples: [690, 850, 1150], readinessScore: 89 }),
      result('B', { latencySamples: [700, 900, 1200], readinessScore: 90 }),
    ]);

    const readiness = report.dimensions.find((d) => d.dimension === 'readiness')!;

    expect(readiness.established).toBe(false);
    expect(readiness.winner).toBeNull();
    expect(readiness.note).toContain('passed through an average');
  });

  it('allows readiness once one of its inputs is established', () => {
    const report = buildComparisonReport([
      result('fast', { latencySamples: [380, 400, 420], readinessScore: 90 }),
      result('slow', { latencySamples: [1100, 1200, 1300], readinessScore: 70 }),
    ]);

    const readiness = report.dimensions.find((d) => d.dimension === 'readiness')!;

    expect(readiness.established).toBe(true);
    expect(readiness.winner).toBe('fast');
  });

  it('computes a per-parameter work rate that can invert the raw result', () => {
    // The real figures: a 3.2B model at 83.8 tok/s against a 7.2B at 44.6.
    const report = buildComparisonReport([
      result('big', {
        throughputSamples: [44.6, 44.6, 44.6],
        parametersBillions: 7.2,
      }),
      result('small', {
        throughputSamples: [83.8, 83.8, 83.8],
        parametersBillions: 3.2,
      }),
    ]);

    const raw = report.dimensions.find((d) => d.dimension === 'throughput')!;
    const perParam = report.dimensions.find(
      (d) => d.dimension === 'throughput_per_parameter'
    )!;

    expect(raw.winner).toBe('small');
    expect(perParam.winner).toBe('big');
    expect(perParam.derived).toBe(true);
    expect(report.methodNotes.join(' ')).toContain('Both are true');
    expect(report.methodNotes.join(' ')).toContain('not a measure of answer quality');
  });

  it('omits the work rate rather than guessing when parameters are unknown', () => {
    const report = buildComparisonReport([
      result('A', { parametersBillions: null }),
      result('B', { parametersBillions: null }),
    ]);

    const perParam = report.dimensions.find(
      (d) => d.dimension === 'throughput_per_parameter'
    )!;

    expect(perParam.winner).toBeNull();
    expect(perParam.note).toContain('Not reported');
  });

  it('keeps derived rows out of the tally', () => {
    const report = buildComparisonReport([
      result('fast', {
        latencySamples: [380, 400, 420],
        throughputSamples: [89, 90, 91],
        parametersBillions: 3,
      }),
      result('slow', {
        latencySamples: [1100, 1200, 1300],
        throughputSamples: [29, 30, 31],
        parametersBillions: 7,
      }),
    ]);

    expect(report.overall.winner).toBe('fast');
    // Only latency and throughput differed. ttft, reliability and hardware are
    // identical in the fixture, and readiness plus the two normalised rows are
    // derived — none of those may inflate the count.
    expect(report.overall.established).toBe(2);
    expect(report.overall.summary).toContain('measured dimensions');
  });

  it('marks hardware fit not comparable when only one entrant has it', () => {
    const report = buildComparisonReport([
      result('local'),
      result('cloud', { hardwareFit: null }),
    ]);

    const hardware = report.dimensions.find((d) => d.dimension === 'hardware')!;

    expect(hardware.winner).toBeNull();
    expect(hardware.note).toContain('nothing to compare');
  });

  it('surfaces a privacy disqualifier that no performance win can offset', () => {
    const report = buildComparisonReport([
      result('local'),
      result('cloud', {
        privacyClass: 'vendor-processed-trains-on-input',
        privacyDisqualifies: ['content-must-not-train-third-party-models'],
        hardwareFit: null,
      }),
    ]);

    expect(report.privacyNotes.join(' ')).toContain(
      'content-must-not-train-third-party-models'
    );
    expect(report.privacyNotes.join(' ')).toContain('no performance result');
  });
});
