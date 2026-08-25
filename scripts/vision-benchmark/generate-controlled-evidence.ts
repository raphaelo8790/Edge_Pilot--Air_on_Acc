import path from 'node:path';
import {
  executeVisionBenchmark,
  FileVisionEvidenceStore,
  loadVisionDatasetManifest,
  SharpVisionImageProcessor,
  VISION_BENCHMARK_PROMPT,
  VISION_PROMPT_VERSION,
  VISION_WORKLOAD_VERSION,
  VisionBenchmarkClock,
  VisionProvider,
  VisionProviderRequest,
  VisionProviderResponse,
} from '../../src/modules/vision-benchmark';

class FixedClock implements VisionBenchmarkClock {
  private isoCall = 0;

  constructor(
    private readonly startedAt: string,
    private readonly completedAt: string
  ) {}

  nowIso(): string {
    this.isoCall += 1;
    return this.isoCall === 1 ? this.startedAt : this.completedAt;
  }

  nowMilliseconds(): number {
    return 0;
  }
}

class ControlledVisionProvider implements VisionProvider {
  constructor(
    readonly providerName: string,
    readonly modelName: string,
    readonly kind: 'local' | 'cloud',
    private readonly baseLatencyMs: number,
    private readonly wrongSampleId: string | null
  ) {}

  async classify(
    request: VisionProviderRequest
  ): Promise<VisionProviderResponse> {
    const rawOutput =
      request.sample.id === this.wrongSampleId
        ? 'goggles'
        : request.sample.expectedLabel;
    const sampleIndex = Number(
      request.sample.id.slice(request.sample.id.lastIndexOf('-') + 1)
    );

    return {
      rawOutput,
      latencyMs: this.baseLatencyMs + sampleIndex * 3,
      success: true,
      errorMessage: null,
    };
  }
}

async function createEvidence(
  repositoryRoot: string,
  provider: VisionProvider,
  startedAt: string,
  completedAt: string
) {
  const loaded = await loadVisionDatasetManifest(repositoryRoot);

  return executeVisionBenchmark({
    provider,
    imageProcessor: new SharpVisionImageProcessor({
      repositoryRoot,
    }),
    samples: loaded.manifest.samples,
    workloadVersion: VISION_WORKLOAD_VERSION,
    manifestVersion: loaded.manifest.manifestVersion,
    manifestSha256: loaded.manifestSha256,
    promptVersion: VISION_PROMPT_VERSION,
    prompt: VISION_BENCHMARK_PROMPT,
    executionMode: 'controlled',
    deviceProfileId: 'controlled-test-device',
    gitCommitSha: '0000000',
    clock: new FixedClock(startedAt, completedAt),
    limitations: [
      'Predictions and latencies are deterministic controlled fixtures, not live provider measurements.',
      'The dataset contains synthetic images and does not estimate production-site accuracy.',
      'The commit marker is intentionally non-release provenance for generated controlled evidence.',
    ],
  });
}

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const store = new FileVisionEvidenceStore(
    path.join(repositoryRoot, 'evidence', 'vision-benchmark')
  );

  const localEvidence = await createEvidence(
    repositoryRoot,
    new ControlledVisionProvider(
      'ollama-controlled',
      'gemma4-fixture',
      'local',
      82,
      'mask-03'
    ),
    '2026-07-24T08:00:00.000Z',
    '2026-07-24T08:00:03.000Z'
  );

  const cloudEvidence = await createEvidence(
    repositoryRoot,
    new ControlledVisionProvider(
      'gemini-controlled',
      'gemini-3.6-flash-fixture',
      'cloud',
      121,
      null
    ),
    '2026-07-24T08:05:00.000Z',
    '2026-07-24T08:05:04.000Z'
  );

  await store.save(localEvidence, 'controlled-ollama.json');
  await store.save(cloudEvidence, 'controlled-gemini.json');

  process.stdout.write(
    'Generated two controlled vision benchmark evidence files.\n'
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown controlled-evidence error';
  process.stderr.write(
    `Controlled evidence generation failed: ${message}\n`
  );
  process.exitCode = 1;
});
