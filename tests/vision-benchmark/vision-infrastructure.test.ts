import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  FileVisionEvidenceStore,
  loadVisionDatasetManifest,
  rankVisionDashboardRows,
  SharpVisionImageProcessor,
  toVisionDashboardRow,
  VISION_LABELS,
  VISION_WORKLOAD_ID,
  VisionBenchmarkEvidenceSchema,
  VisionBenchmarkRunRequestSchema,
} from '../../src/modules/vision-benchmark';

const repositoryRoot = process.cwd();
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function loadControlledEvidence() {
  const raw = await readFile(
    path.join(
      repositoryRoot,
      'evidence',
      'vision-benchmark',
      'controlled-gemini.json'
    ),
    'utf8'
  );

  return VisionBenchmarkEvidenceSchema.parse(JSON.parse(raw));
}

describe('vision dataset infrastructure', () => {
  test('loads a ready, licensed, privacy-reviewed manifest', async () => {
    const loaded = await loadVisionDatasetManifest(repositoryRoot);

    expect(loaded.manifest.status).toBe('ready');
    expect(loaded.manifest.license.spdxId).toBe('MIT');
    expect(
      loaded.manifest.privacyChecks.manualReviewCompleted
    ).toBe(true);
    expect(loaded.manifest.samples).toHaveLength(21);
    expect(loaded.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('contains exactly three samples for every label', async () => {
    const loaded = await loadVisionDatasetManifest(repositoryRoot);

    for (const label of VISION_LABELS) {
      expect(
        loaded.manifest.samples.filter(
          (sample) => sample.expectedLabel === label
        )
      ).toHaveLength(3);
    }
  });

  test('verifies and preprocesses a generated PNG fixture', async () => {
    const loaded = await loadVisionDatasetManifest(repositoryRoot);
    const sample = loaded.manifest.samples[0];
    const processor = new SharpVisionImageProcessor({
      repositoryRoot,
    });

    const image = await processor.prepare(sample);

    expect(image.mimeType).toBe('image/png');
    expect(image.width).toBe(256);
    expect(image.height).toBe(256);
    expect(image.sourceSha256).toBe(sample.sha256);
    expect(image.processedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(image.processedBytes).toBeGreaterThan(0);
  });

  test('rejects a fixture with a mismatched SHA-256', async () => {
    const loaded = await loadVisionDatasetManifest(repositoryRoot);
    const processor = new SharpVisionImageProcessor({
      repositoryRoot,
    });

    await expect(
      processor.prepare({
        ...loaded.manifest.samples[0],
        sha256: 'f'.repeat(64),
      })
    ).rejects.toThrow('failed SHA-256 verification');
  });

  test('rejects a sample path outside the repository', async () => {
    const loaded = await loadVisionDatasetManifest(repositoryRoot);
    const processor = new SharpVisionImageProcessor({
      repositoryRoot,
    });

    await expect(
      processor.prepare({
        ...loaded.manifest.samples[0],
        imagePath: '../outside.png',
      })
    ).rejects.toThrow('points outside the repository');
  });
});

describe('vision request, evidence, and dashboard contracts', () => {
  test('accepts a complete typed run request', () => {
    const result = VisionBenchmarkRunRequestSchema.safeParse({
      workloadId: VISION_WORKLOAD_ID,
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      deviceProfileId: 'test-device',
      gitCommitSha: '0cd3930',
      promptVersion: '1.0.0',
      prompt: 'Return one label.',
    });

    expect(result.success).toBe(true);
  });

  test('rejects an unsupported provider in a run request', () => {
    const result = VisionBenchmarkRunRequestSchema.safeParse({
      workloadId: VISION_WORKLOAD_ID,
      provider: 'unsupported',
      model: 'model',
      deviceProfileId: 'test-device',
      gitCommitSha: '0cd3930',
      promptVersion: '1.0.0',
      prompt: 'Return one label.',
    });

    expect(result.success).toBe(false);
  });

  test('validates committed controlled evidence', async () => {
    const evidence = await loadControlledEvidence();

    expect(evidence.executionMode).toBe('controlled');
    expect(evidence.metrics.totalSamples).toBe(21);
    expect(evidence.passed).toBe(true);
  });

  test('maps evidence into the dashboard contract', async () => {
    const evidence = await loadControlledEvidence();
    const row = toVisionDashboardRow(evidence);

    expect(row.provider).toBe('gemini-controlled');
    expect(row.sampleCount).toBe(21);
    expect(row.accuracy).toBe(1);
    expect(row.executionMode).toBe('controlled');
  });

  test('ranks passing and more accurate dashboard rows first', async () => {
    const evidence = await loadControlledEvidence();
    const best = toVisionDashboardRow(evidence);
    const lower = {
      ...best,
      provider: 'lower-provider',
      accuracy: 0.8,
      macroF1: 0.8,
    };

    expect(
      rankVisionDashboardRows([lower, best]).map(
        (row) => row.provider
      )
    ).toEqual(['gemini-controlled', 'lower-provider']);
  });

  test('round-trips validated evidence through the file store', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'edgepilot-evidence-')
    );
    temporaryDirectories.push(directory);
    const store = new FileVisionEvidenceStore(directory);
    const evidence = await loadControlledEvidence();

    await store.save(evidence, 'controlled-test.json');
    const restored = await store.readAll();

    expect(restored).toEqual([evidence]);
  });

  test('rejects unsafe evidence filenames', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'edgepilot-evidence-')
    );
    temporaryDirectories.push(directory);
    const store = new FileVisionEvidenceStore(directory);
    const evidence = await loadControlledEvidence();

    await expect(
      store.save(evidence, '../outside.json')
    ).rejects.toThrow('filename is not safe');
  });
});
