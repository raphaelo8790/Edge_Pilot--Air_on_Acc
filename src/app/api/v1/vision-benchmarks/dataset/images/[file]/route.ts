/**
 * GET /api/v1/vision-benchmarks/dataset/images/<file> — one built-in fixture
 * image, for a browser running the reference dataset against its own Ollama.
 *
 * Only a file the manifest names is served. The name is matched against the
 * manifest's own list rather than joined onto a directory, so a request
 * cannot read anything else however it is spelled.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { loadVisionDatasetManifest } from '@/modules/vision-benchmark/infrastructure/manifest-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> }
) {
  try {
    const { file } = await context.params;
    const loaded = await loadVisionDatasetManifest(process.cwd());

    const sample = loaded.manifest.samples.find(
      (entry) => entry.imagePath.split('/').pop() === file
    );

    if (!sample) {
      return NextResponse.json(
        { success: false, error: 'No such image in the built-in dataset.' },
        { status: 404 }
      );
    }

    const bytes = await readFile(path.resolve(process.cwd(), sample.imagePath));

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'content-type': 'image/png',
        // The fixtures are versioned by the manifest digest, so a browser may
        // keep them for the session.
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Vision dataset image error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
