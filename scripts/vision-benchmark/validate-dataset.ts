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

  // Record<string, number>, not Record<VisionLabel, number>.
  //
  // `expectedLabel` is a plain string now, because a dataset defines its own
  // classes. Counting into a map keyed by the seven built-in literals would
  // not type check, and forcing it to would be worse: it would assert that
  // this manifest can only contain those seven, which is the assumption the
  // widening removed. The built-in manifest is still pinned to them by its own
  // schema, so seeding the counters from VISION_LABELS keeps a class with zero
  // samples visible in the output rather than silently absent.
  const labelCounts: Record<string, number> = Object.fromEntries(
    VISION_LABELS.map((label) => [label, 0])
  );

  /** Labels in the manifest that are not part of the built-in taxonomy. */
  const unexpectedLabels = new Set<string>();

  let sourceBytes = 0;
  let processedBytes = 0;

  for (const sample of loaded.manifest.samples) {
    const image = await processor.prepare(sample);
    if (!(sample.expectedLabel in labelCounts)) {
      unexpectedLabels.add(sample.expectedLabel);
    }

    labelCounts[sample.expectedLabel] =
      (labelCounts[sample.expectedLabel] ?? 0) + 1;
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
        unexpectedLabels: Array.from(unexpectedLabels).sort(),
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
