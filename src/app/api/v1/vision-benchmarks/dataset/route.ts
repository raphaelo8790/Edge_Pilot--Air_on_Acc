/**
 * GET /api/v1/vision-benchmarks/dataset — the built-in reference dataset,
 * described for a browser that is about to run it.
 *
 * WHY. The built-in run used to be a server action calling the SERVER's
 * Ollama. Hosted, there is no such thing; the only Ollama that can be
 * measured is the visitor's, and only their browser can reach it. So the
 * browser needs what the server's run-service reads from disk: the manifest
 * (samples, labels, digest), the prompt, and a way to fetch each image. This
 * answers the first two; `dataset/images/<file>` serves the third.
 *
 * Nothing private: the dataset ships in the public repository under MIT.
 */

import { NextResponse } from 'next/server';
import { loadVisionDatasetManifest } from '@/modules/vision-benchmark/infrastructure/manifest-loader';
import {
  VISION_BENCHMARK_PROMPT,
  VISION_PROMPT_VERSION,
  VISION_WORKLOAD_VERSION,
} from '@/modules/vision-benchmark/core/workload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const loaded = await loadVisionDatasetManifest(process.cwd());
    const manifest = loaded.manifest;

    if (manifest.status !== 'ready') {
      return NextResponse.json(
        { success: false, error: 'The built-in dataset is not ready.' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        dataset_id: manifest.datasetId,
        workload_id: manifest.workloadId,
        manifest_version: manifest.manifestVersion,
        manifest_sha256: loaded.manifestSha256,
        labels: manifest.labels,
        prompt: VISION_BENCHMARK_PROMPT,
        prompt_version: VISION_PROMPT_VERSION,
        workload_version: VISION_WORKLOAD_VERSION,
        // Each sample as the executor expects it, plus the URL the browser
        // fetches the image from. `imagePath` is kept verbatim so the
        // evidence a browser produces names the same file a server run would.
        samples: manifest.samples.map((sample) => ({
          ...sample,
          image_url: `/api/v1/vision-benchmarks/dataset/images/${encodeURIComponent(
            sample.imagePath.split('/').pop() ?? ''
          )}`,
        })),
      },
    });
  } catch (error) {
    console.error('Vision dataset error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
