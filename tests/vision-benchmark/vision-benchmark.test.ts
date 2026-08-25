import { evaluateVisionBenchmark } from '../../src/modules/vision-benchmark';
import { calculateVisionMetrics } from '../../src/modules/vision-benchmark/core/metrics';
import { normalizeVisionLabel } from '../../src/modules/vision-benchmark/core/normalization';
import { VisionDatasetManifestSchema } from '../../src/modules/vision-benchmark/core/schemas';
import {
  VISION_DATASET_ID,
  VISION_LABELS,
  VisionBenchmarkEvaluationInput,
  VisionBenchmarkSample,
  VisionPredictionRecord,
} from '../../src/modules/vision-benchmark/core/types';

const VALID_SHA = 'a'.repeat(64);

function createSample(
  id: string,
  expectedLabel: VisionBenchmarkSample['expectedLabel'] = 'hardhat'
): VisionBenchmarkSample {
  return {
    id,
    imagePath: `datasets/vision-benchmark/images/${id}.png`,
    expectedLabel,
    sourceId: `synthetic-${expectedLabel}-v1`,
    licenseSpdx: 'MIT',
    licenseVerified: true,
    privacyReviewed: true,
    containsPeople: false,
    containsFaces: false,
    containsPersonalData: false,
    exifPresent: false,
    sha256: VALID_SHA,
  };
}

function createManifestSamples(): VisionBenchmarkSample[] {
  return VISION_LABELS.flatMap((label) =>
    [1, 2, 3].map((index) =>
      createSample(
        `${label}-${String(index).padStart(2, '0')}`,
        label
      )
    )
  );
}

function createEvaluationInput(): VisionBenchmarkEvaluationInput {
  return {
    workloadVersion: '1.0.0',
    datasetId: VISION_DATASET_ID,
    manifestVersion: '1.0.0',
    manifestSha256: 'b'.repeat(64),
    preprocessingVersion: 'test-processor-v1',
    promptVersion: '1.0.0',
    executionMode: 'controlled',
    provider: 'test-provider',
    providerKind: 'local',
    model: 'test-model',
    deviceProfileId: 'test-device',
    gitCommitSha: '0cd3930',
    startedAt: '2026-07-23T12:00:00.000Z',
    completedAt: '2026-07-23T12:00:01.000Z',
    samples: [createSample('sample-001')],
    responses: [
      {
        rawOutput: 'hardhat',
        latencyMs: 100,
        success: true,
        errorMessage: null,
      },
    ],
  };
}

function createRecord(
  overrides: Partial<VisionPredictionRecord> = {}
): VisionPredictionRecord {
  return {
    sampleId: 'sample-001',
    expectedLabel: 'hardhat',
    rawOutput: 'hardhat',
    normalizedLabel: 'hardhat',
    latencyMs: 100,
    providerSuccess: true,
    errorCategory: null,
    ...overrides,
  };
}

describe('vision label normalization', () => {
  test('normalizes a direct supported label', () => {
    expect(normalizeVisionLabel('hardhat')).toBe('hardhat');
  });

  test('normalizes spaces and letter casing', () => {
    expect(normalizeVisionLabel('Safety Vest')).toBe('safety_vest');
  });

  test('normalizes a quoted hard hat alias', () => {
    expect(normalizeVisionLabel('"Hard Hat"')).toBe('hardhat');
  });

  test('normalizes hyphenated labels', () => {
    expect(normalizeVisionLabel('safety-cone')).toBe('safety_cone');
  });

  test('rejects explanations instead of extracting a label', () => {
    expect(
      normalizeVisionLabel('The image contains a hardhat.')
    ).toBeNull();
  });

  test('rejects unknown labels', () => {
    expect(normalizeVisionLabel('boots')).toBeNull();
  });
});

describe('vision dataset manifest validation', () => {
  const baseManifest = {
    schemaVersion: '1.0.0',
    datasetId: VISION_DATASET_ID,
    workloadId: 'construction-component-recognition-v1',
    manifestVersion: '1.0.0',
    status: 'ready',
    title: 'Fixture dataset',
    description: 'Deterministic test fixtures.',
    source: {
      type: 'project_generated_synthetic',
      generator:
        'scripts/vision-benchmark/generate-fixtures.mjs',
      repository: 'https://github.com/Ahmed-Sleem/edgepilot-ai',
      createdBy: 'EdgePilot AI contributors',
    },
    license: {
      spdxId: 'MIT',
      file: 'LICENSE',
      redistributionAllowed: true,
      commercialUseAllowed: true,
    },
    labels: [
      'hardhat',
      'safety_vest',
      'gloves',
      'goggles',
      'mask',
      'ladder',
      'safety_cone',
    ],
    privacyChecks: {
      peopleAllowed: false,
      facesAllowed: false,
      personalDataAllowed: false,
      locationMetadataAllowed: false,
      exifMustBeRemoved: true,
      manualReviewRequired: true,
      manualReviewCompleted: true,
    },
    generation: {
      width: 256,
      height: 256,
      samplesPerLabel: 3,
      deterministic: true,
    },
    samples: createManifestSamples(),
  };

  test('accepts a valid ready manifest', () => {
    expect(
      VisionDatasetManifestSchema.safeParse(baseManifest).success
    ).toBe(true);
  });

  test('rejects an unsupported label', () => {
    const result = VisionDatasetManifestSchema.safeParse({
      ...baseManifest,
      labels: [...baseManifest.labels.slice(0, 6), 'boots'],
    });

    expect(result.success).toBe(false);
  });

  test('rejects duplicate sample identifiers', () => {
    const result = VisionDatasetManifestSchema.safeParse({
      ...baseManifest,
      samples: [
        createSample('duplicate'),
        createSample('duplicate', 'gloves'),
      ],
    });

    expect(result.success).toBe(false);
  });

  test('rejects an unverified sample license', () => {
    const result = VisionDatasetManifestSchema.safeParse({
      ...baseManifest,
      samples: [
        {
          ...baseManifest.samples[0],
          licenseVerified: false,
        },
        ...baseManifest.samples.slice(1),
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe('deterministic vision metrics', () => {
  test('returns perfect scores for perfect predictions', () => {
    const metrics = calculateVisionMetrics([
      createRecord(),
      createRecord({
        sampleId: 'sample-002',
        expectedLabel: 'gloves',
        normalizedLabel: 'gloves',
        rawOutput: 'gloves',
      }),
    ]);

    expect(metrics.exactMatchAccuracy).toBe(1);
    expect(metrics.macroF1).toBe(1);
  });

  test('keeps metrics finite when a class has no correct prediction', () => {
    const metrics = calculateVisionMetrics([
      createRecord({
        normalizedLabel: 'gloves',
        rawOutput: 'gloves',
      }),
    ]);

    expect(Number.isFinite(metrics.macroF1)).toBe(true);
    expect(metrics.macroF1).toBe(0);
  });

  test('calculates median for an even number of observations', () => {
    const metrics = calculateVisionMetrics([
      createRecord({ latencyMs: 100 }),
      createRecord({
        sampleId: 'sample-002',
        latencyMs: 300,
      }),
    ]);

    expect(metrics.medianLatencyMs).toBe(200);
  });

  test('calculates p95 using nearest rank', () => {
    const records = [10, 20, 30, 40, 50].map(
      (latencyMs, index) =>
        createRecord({
          sampleId: `sample-${index}`,
          latencyMs,
        })
    );

    expect(calculateVisionMetrics(records).p95LatencyMs).toBe(50);
  });

  test('counts invalid successful responses separately', () => {
    const metrics = calculateVisionMetrics([
      createRecord({
        normalizedLabel: null,
        rawOutput: 'I cannot identify the object.',
        errorCategory: 'invalid_output',
      }),
    ]);

    expect(metrics.invalidOutputRate).toBe(1);
    expect(metrics.successfulRequestRate).toBe(1);
  });

  test('counts provider failures in successful request rate', () => {
    const metrics = calculateVisionMetrics([
      createRecord({
        normalizedLabel: null,
        rawOutput: '',
        providerSuccess: false,
        errorCategory: 'provider_error',
      }),
    ]);

    expect(metrics.invalidOutputRate).toBe(0);
    expect(metrics.successfulRequestRate).toBe(0);
  });
});

describe('vision benchmark evaluator', () => {
  test('creates passing evidence for a correct response', () => {
    const evidence = evaluateVisionBenchmark(
      createEvaluationInput()
    );

    expect(evidence.passed).toBe(true);
    expect(evidence.records[0].normalizedLabel).toBe('hardhat');
  });

  test('creates deterministic evidence for identical inputs', () => {
    const input = createEvaluationInput();

    expect(evaluateVisionBenchmark(input)).toEqual(
      evaluateVisionBenchmark(input)
    );
  });

  test('rejects mismatched sample and response counts', () => {
    const input = createEvaluationInput();
    input.responses = [];

    expect(() => evaluateVisionBenchmark(input)).toThrow(
      'The number of responses must match the number of samples.'
    );
  });

  test('rejects samples without completed privacy review', () => {
    const input = createEvaluationInput();
    input.samples[0].privacyReviewed = false;

    expect(() => evaluateVisionBenchmark(input)).toThrow(
      "Sample 'sample-001' has not passed privacy review."
    );
  });

  test('marks explanatory output as invalid', () => {
    const input = createEvaluationInput();
    input.responses[0].rawOutput =
      'The object in this image is a hardhat.';

    const evidence = evaluateVisionBenchmark(input);

    expect(evidence.records[0].normalizedLabel).toBeNull();
    expect(evidence.records[0].errorCategory).toBe(
      'invalid_output'
    );
    expect(evidence.passed).toBe(false);
  });

  test('marks failed provider requests as provider errors', () => {
    const input = createEvaluationInput();
    input.responses[0] = {
      rawOutput: '',
      latencyMs: 2000,
      success: false,
      errorMessage: 'Request timeout',
    };

    const evidence = evaluateVisionBenchmark(input);

    expect(evidence.records[0].errorCategory).toBe(
      'provider_error'
    );
    expect(evidence.metrics.successfulRequestRate).toBe(0);
  });
});
