import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  VisionDatasetManifest,
  VisionDatasetManifestSchema,
} from '../core/schemas';

export const DEFAULT_VISION_MANIFEST_PATH =
  'datasets/vision-benchmark/manifest.json';

export interface LoadedVisionDatasetManifest {
  manifest: VisionDatasetManifest;
  manifestSha256: string;
  absolutePath: string;
}

export async function loadVisionDatasetManifest(
  repositoryRoot: string,
  manifestPath = DEFAULT_VISION_MANIFEST_PATH
): Promise<LoadedVisionDatasetManifest> {
  const absoluteRoot = path.resolve(repositoryRoot);
  const absolutePath = path.resolve(absoluteRoot, manifestPath);
  const relativePath = path.relative(absoluteRoot, absolutePath);

  if (
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('The dataset manifest must be inside the repository.');
  }

  const rawManifest = await readFile(absolutePath);
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawManifest.toString('utf8'));
  } catch {
    throw new Error('The vision dataset manifest is not valid JSON.');
  }

  return {
    manifest: VisionDatasetManifestSchema.parse(parsedJson),
    manifestSha256: createHash('sha256')
      .update(rawManifest)
      .digest('hex'),
    absolutePath,
  };
}
