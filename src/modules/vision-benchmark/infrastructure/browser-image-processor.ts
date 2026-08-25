/**
 * The image processor that runs in the user's browser.
 *
 * WHY THIS EXISTS. SharpVisionImageProcessor reads files from disk with a
 * Node library. When a user brings their own photographs, sending them to a
 * server to be resized would mean their images leave their machine - which
 * collides with this project's own non-goal about benchmarking confidential
 * data. This prepares them in the tab instead, so the only place an uploaded
 * image travels is from the browser to the user's own Ollama on localhost.
 *
 * WHY THE VERSION STRING IS DIFFERENT, AND MUST STAY DIFFERENT.
 * `preprocessingVersion` is recorded on every piece of evidence so two runs
 * can be compared only when the images were prepared the same way. Canvas and
 * sharp do not resample identically or encode PNG identically, so this
 * declares 'browser-canvas-png-v1' rather than borrowing 'sharp-png-v1'.
 * Claiming the same pipeline would make two incomparable runs look comparable,
 * which is a worse failure than refusing to compare them.
 *
 * Geometry matches deliberately - longest edge 512, aspect preserved - so the
 * model sees the same shape of input either way. The bytes will differ.
 */

import type {
  VisionImageProcessor,
} from '../application/provider';
import type {
  PreparedVisionImage,
  VisionBenchmarkSample,
} from '../core/types';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_DIMENSION = 4096;
const OUTPUT_DIMENSION = 512;

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * EXIF is detected, not assumed.
 *
 * A JPEG carrying an APP1 segment whose payload begins "Exif\0\0" has EXIF,
 * which can hold GPS coordinates and a camera serial number. Reading two
 * bytes of marker and four of magic is enough to say so honestly; the
 * canvas re-encode below then strips it, because a PNG drawn from pixels
 * carries none of the source metadata forward.
 */
function detectExif(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false; // not a JPEG; PNG/WebP here carry no EXIF we would pass on
  }

  let offset = 2;

  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return false;
    }

    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];

    if (marker === 0xe1) {
      // Array.from, NOT spread. This project compiles with "target": "es5"
      // and no downlevelIteration, under which spreading a typed array is a
      // compile error - and spreading a Map or Set silently produces an empty
      // array instead. Array.from is a runtime method, emitted verbatim, and
      // takes the array-like path. Same rule as the sweep in SessionLog.
      const header = String.fromCharCode.apply(
        null,
        Array.from(bytes.slice(offset + 4, offset + 8))
      );

      return header === 'Exif';
    }

    if (marker === 0xda) {
      return false; // start of scan: no more metadata segments
    }

    offset += 2 + length;
  }

  return false;
}

export interface BrowserPreparedImage extends PreparedVisionImage {
  /** True when the SOURCE carried EXIF. The prepared PNG never does. */
  sourceExifPresent: boolean;
}

export class BrowserVisionImageProcessor implements VisionImageProcessor {
  readonly version = 'browser-canvas-png-v1';

  /** Source files by sample id, set by the upload panel before a run. */
  constructor(private readonly files: Map<string, File>) {}

  public async prepare(
    sample: VisionBenchmarkSample
  ): Promise<BrowserPreparedImage> {
    const file = this.files.get(sample.id);

    if (!file) {
      throw new Error(`No uploaded file for sample '${sample.id}'.`);
    }

    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error(
        `Sample '${sample.id}' is ${(file.size / 1_000_000).toFixed(1)} MB, ` +
          `over the ${MAX_SOURCE_BYTES / 1_000_000} MB limit.`
      );
    }

    const sourceBuffer = await file.arrayBuffer();
    const sourceBytes = new Uint8Array(sourceBuffer);
    const sourceSha256 = await sha256Hex(sourceBuffer);
    const sourceExifPresent = detectExif(sourceBytes);

    const bitmap = await createImageBitmap(file);

    try {
      if (
        bitmap.width > MAX_INPUT_DIMENSION ||
        bitmap.height > MAX_INPUT_DIMENSION
      ) {
        throw new Error(
          `Sample '${sample.id}' is ${bitmap.width}x${bitmap.height}, over the ` +
            `${MAX_INPUT_DIMENSION}px limit.`
        );
      }

      const scale = Math.min(
        1,
        OUTPUT_DIMENSION / Math.max(bitmap.width, bitmap.height)
      );
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('This browser refused a 2D canvas context.');
      }

      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (!blob) {
        throw new Error(`Sample '${sample.id}' could not be re-encoded.`);
      }

      const processedBuffer = await blob.arrayBuffer();

      return {
        data: new Uint8Array(processedBuffer),
        mimeType: 'image/png',
        width,
        height,
        sourceBytes: file.size,
        processedBytes: processedBuffer.byteLength,
        sourceSha256,
        processedSha256: await sha256Hex(processedBuffer),
        sourceExifPresent,
      };
    } finally {
      bitmap.close();
    }
  }
}
