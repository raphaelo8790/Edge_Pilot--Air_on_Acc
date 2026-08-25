import path from 'node:path';
import {
  loadVisionDatasetManifest,
  SharpVisionImageProcessor,
  VISION_LABELS,
} from '../../src/modules/vision-benchmark';

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const loaded = await loadVisionDatasetManifest(repositoryRoot);
  const processor = new SharpVisionImageProcessor({
    repositoryRoot,
  });

  const labelCounts = Object.fromEntries(
    VISION_LABELS.map((label) => [label, 0])
  ) as Record<(typeof VISION_LABELS)[number], number>;

  let sourceBytes = 0;
  let processedBytes = 0;

  for (const sample of loaded.manifest.samples) {
    const image = await processor.prepare(sample);
    labelCounts[sample.expectedLabel] += 1;
    sourceBytes += image.sourceBytes;
    processedBytes += image.processedBytes;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        manifest: path.relative(
          repositoryRoot,
          loaded.absolutePath
        ),
        manifestSha256: loaded.manifestSha256,
        status: loaded.manifest.status,
        sampleCount: loaded.manifest.samples.length,
        labelCounts,
        sourceBytes,
        processedBytes,
        privacyReviewed:
          loaded.manifest.privacyChecks.manualReviewCompleted,
        license: loaded.manifest.license.spdxId,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown validation error';
  process.stderr.write(`Vision dataset validation failed: ${message}\n`);
  process.exitCode = 1;
});
