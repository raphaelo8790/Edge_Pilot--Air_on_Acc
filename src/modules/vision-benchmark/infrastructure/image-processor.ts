import { createHash } from 'node:crypto';
import {
  lstat,
  readFile,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { VisionImageProcessor } from '../application/provider';
import {
  PreparedVisionImage,
  VisionBenchmarkSample,
} from '../core/types';

const DEFAULT_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 4096;
const DEFAULT_OUTPUT_DIMENSION = 512;

export interface SharpVisionImageProcessorOptions {
  repositoryRoot: string;
  maximumSourceBytes?: number;
  maximumInputDimension?: number;
  maximumOutputDimension?: number;
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return (
    relative.length > 0 &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

export class SharpVisionImageProcessor
  implements VisionImageProcessor
{
  readonly version = 'sharp-png-v1';

  private readonly repositoryRoot: string;
  private readonly maximumSourceBytes: number;
  private readonly maximumInputDimension: number;
  private readonly maximumOutputDimension: number;

  constructor(options: SharpVisionImageProcessorOptions) {
    this.repositoryRoot = path.resolve(options.repositoryRoot);
    this.maximumSourceBytes =
      options.maximumSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
    this.maximumInputDimension =
      options.maximumInputDimension ?? DEFAULT_MAX_DIMENSION;
    this.maximumOutputDimension =
      options.maximumOutputDimension ?? DEFAULT_OUTPUT_DIMENSION;
  }

  async prepare(
    sample: VisionBenchmarkSample
  ): Promise<PreparedVisionImage> {
    const requestedPath = path.resolve(
      this.repositoryRoot,
      sample.imagePath
    );

    if (!isPathInside(this.repositoryRoot, requestedPath)) {
      throw new Error(
        `Sample '${sample.id}' points outside the repository.`
      );
    }

    const fileStats = await lstat(requestedPath);

    if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
      throw new Error(
        `Sample '${sample.id}' must reference a regular image file.`
      );
    }

    if (fileStats.size > this.maximumSourceBytes) {
      throw new Error(
        `Sample '${sample.id}' exceeds the source-size limit.`
      );
    }

    const canonicalPath = await realpath(requestedPath);

    if (!isPathInside(this.repositoryRoot, canonicalPath)) {
      throw new Error(
        `Sample '${sample.id}' resolves outside the repository.`
      );
    }

    const source = await readFile(canonicalPath);
    const sourceSha256 = sha256(source);

    if (sourceSha256 !== sample.sha256) {
      throw new Error(
        `Sample '${sample.id}' failed SHA-256 verification.`
      );
    }

    const metadata = await sharp(source, {
      failOn: 'warning',
      limitInputPixels:
        this.maximumInputDimension * this.maximumInputDimension,
    }).metadata();

    if (
      metadata.format !== 'png' &&
      metadata.format !== 'jpeg' &&
      metadata.format !== 'webp'
    ) {
      throw new Error(
        `Sample '${sample.id}' uses an unsupported image format.`
      );
    }

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > this.maximumInputDimension ||
      metadata.height > this.maximumInputDimension
    ) {
      throw new Error(
        `Sample '${sample.id}' has invalid image dimensions.`
      );
    }

    if (metadata.pages && metadata.pages !== 1) {
      throw new Error(
        `Sample '${sample.id}' must contain exactly one image frame.`
      );
    }

    if (metadata.exif || metadata.xmp || metadata.iptc) {
      throw new Error(
        `Sample '${sample.id}' contains prohibited metadata.`
      );
    }

    const processed = await sharp(source, {
      failOn: 'warning',
      limitInputPixels:
        this.maximumInputDimension * this.maximumInputDimension,
    })
      .autoOrient()
      .resize({
        width: this.maximumOutputDimension,
        height: this.maximumOutputDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: false,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      data: processed.data,
      mimeType: 'image/png',
      width: processed.info.width,
      height: processed.info.height,
      sourceBytes: source.byteLength,
      processedBytes: processed.data.byteLength,
      sourceSha256,
      processedSha256: sha256(processed.data),
    };
  }
}
