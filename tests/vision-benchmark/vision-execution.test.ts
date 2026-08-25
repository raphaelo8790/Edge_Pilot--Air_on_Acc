import {
  executeVisionBenchmark,
  PreparedVisionImage,
  VisionBenchmarkClock,
  VisionImageProcessor,
  VisionBenchmarkSample,
  VisionProvider,
  VisionProviderRequest,
  VisionProviderResponse,
} from '../../src/modules/vision-benchmark';

const VALID_SHA = 'a'.repeat(64);

function createSample(
  id: string,
  expectedLabel: VisionBenchmarkSample['expectedLabel']
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

class FakeImageProcessor implements VisionImageProcessor {
  readonly version = 'fake-image-processor-v1';

  async prepare(): Promise<PreparedVisionImage> {
    return {
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      width: 32,
      height: 32,
      sourceBytes: 3,
      processedBytes: 3,
      sourceSha256: VALID_SHA,
      processedSha256: VALID_SHA,
    };
  }
}

class SequenceClock implements VisionBenchmarkClock {
  private isoIndex = 0;
  private millisecondIndex = 0;

  constructor(
    private readonly isoValues: string[],
    private readonly millisecondValues: number[]
  ) {}

  nowIso(): string {
    const value = this.isoValues[this.isoIndex];
    this.isoIndex += 1;

    if (value === undefined) {
      throw new Error('No deterministic ISO clock value remains.');
    }

    return value;
  }

  nowMilliseconds(): number {
    const value = this.millisecondValues[
      this.millisecondIndex
    ];
    this.millisecondIndex += 1;

    if (value === undefined) {
      throw new Error(
        'No deterministic millisecond clock value remains.'
      );
    }

    return value;
  }
}

class FakeVisionProvider implements VisionProvider {
  readonly requests: VisionProviderRequest[] = [];

  constructor(
    readonly providerName: string,
    readonly modelName: string,
    readonly kind: 'local' | 'cloud',
    private readonly handler: (
      request: VisionProviderRequest
    ) => Promise<VisionProviderResponse>
  ) {}

  async classify(
    request: VisionProviderRequest
  ): Promise<VisionProviderResponse> {
    this.requests.push(request);
    return this.handler(request);
  }
}

function createExecutionInput(
  provider: VisionProvider,
  clock: VisionBenchmarkClock,
  samples: VisionBenchmarkSample[] = [
    createSample('sample-001', 'hardhat'),
  ]
) {
  return {
    provider,
    imageProcessor: new FakeImageProcessor(),
    clock,
    samples,
    workloadVersion: '1.0.0',
    manifestVersion: '1.0.0',
    manifestSha256: 'b'.repeat(64),
    promptVersion: '1.0.0',
    prompt:
      'Return exactly one supported construction component label.',
    executionMode: 'controlled' as const,
    deviceProfileId: 'test-device',
    gitCommitSha: '0cd3930',
  };
}

describe('vision benchmark execution boundary', () => {
  test('executes a local provider and creates evidence', async () => {
    const provider = new FakeVisionProvider(
      'fake-local',
      'local-model',
      'local',
      async () => ({
        rawOutput: 'hardhat',
        latencyMs: 25,
        success: true,
        errorMessage: null,
      })
    );

    const clock = new SequenceClock(
      [
        '2026-07-24T12:00:00.000Z',
        '2026-07-24T12:00:01.000Z',
      ],
      [100, 125]
    );

    const evidence = await executeVisionBenchmark(
      createExecutionInput(provider, clock)
    );

    expect(evidence.provider).toBe('fake-local');
    expect(evidence.model).toBe('local-model');
    expect(evidence.metrics.exactMatchAccuracy).toBe(1);
    expect(evidence.limitations).toContain(
      'Provider execution mode: local.'
    );
    expect(provider.requests).toHaveLength(1);
  });

  test('executes a cloud provider through the same contract', async () => {
    const provider = new FakeVisionProvider(
      'fake-cloud',
      'cloud-model',
      'cloud',
      async () => ({
        rawOutput: 'Safety Vest',
        latencyMs: 80,
        success: true,
        errorMessage: null,
      })
    );

    const clock = new SequenceClock(
      [
        '2026-07-24T13:00:00.000Z',
        '2026-07-24T13:00:01.000Z',
      ],
      [200, 280]
    );

    const evidence = await executeVisionBenchmark(
      createExecutionInput(
        provider,
        clock,
        [createSample('sample-002', 'safety_vest')]
      )
    );

    expect(evidence.metrics.exactMatchAccuracy).toBe(1);
    expect(evidence.records[0].normalizedLabel).toBe(
      'safety_vest'
    );
    expect(evidence.limitations).toContain(
      'Provider execution mode: cloud.'
    );
  });

  test('preserves sample order during sequential execution', async () => {
    const outputs = ['hardhat', 'gloves'];

    const provider = new FakeVisionProvider(
      'ordered-provider',
      'ordered-model',
      'local',
      async () => ({
        rawOutput: outputs.shift() ?? '',
        latencyMs: 10,
        success: true,
        errorMessage: null,
      })
    );

    const clock = new SequenceClock(
      [
        '2026-07-24T14:00:00.000Z',
        '2026-07-24T14:00:01.000Z',
      ],
      [0, 10, 10, 20]
    );

    const evidence = await executeVisionBenchmark(
      createExecutionInput(
        provider,
        clock,
        [
          createSample('sample-001', 'hardhat'),
          createSample('sample-002', 'gloves'),
        ]
      )
    );

    expect(
      evidence.records.map((record) => record.sampleId)
    ).toEqual(['sample-001', 'sample-002']);

    expect(evidence.metrics.exactMatchAccuracy).toBe(1);
  });

  test('converts a thrown provider error into failure evidence', async () => {
    const provider = new FakeVisionProvider(
      'failing-provider',
      'failing-model',
      'cloud',
      async () => {
        throw new Error('Provider unavailable');
      }
    );

    const clock = new SequenceClock(
      [
        '2026-07-24T15:00:00.000Z',
        '2026-07-24T15:00:02.000Z',
      ],
      [500, 2500]
    );

    const evidence = await executeVisionBenchmark(
      createExecutionInput(provider, clock)
    );

    expect(evidence.records[0].providerSuccess).toBe(false);
    expect(evidence.records[0].errorCategory).toBe(
      'provider_error'
    );
    expect(evidence.records[0].latencyMs).toBe(2000);
    expect(evidence.metrics.successfulRequestRate).toBe(0);
  });

  test('rejects an empty prompt before provider execution', async () => {
    const provider = new FakeVisionProvider(
      'unused-provider',
      'unused-model',
      'local',
      async () => ({
        rawOutput: 'hardhat',
        latencyMs: 1,
        success: true,
        errorMessage: null,
      })
    );

    const clock = new SequenceClock([], []);

    await expect(
      executeVisionBenchmark({
        ...createExecutionInput(provider, clock),
        prompt: '   ',
      })
    ).rejects.toThrow(
      'The vision benchmark prompt cannot be empty.'
    );

    expect(provider.requests).toHaveLength(0);
  });
});
