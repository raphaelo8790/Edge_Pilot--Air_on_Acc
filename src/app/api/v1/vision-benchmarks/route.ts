import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  rankVisionDashboardRows,
  toVisionDashboardRow,
} from '@/modules/vision-benchmark/application/dashboard';
import { FileVisionEvidenceStore } from '@/modules/vision-benchmark/infrastructure/evidence-store';
import { runVisionBenchmarkRequest } from '@/modules/vision-benchmark/infrastructure/run-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function evidenceStore(): FileVisionEvidenceStore {
  return new FileVisionEvidenceStore(
    path.join(process.cwd(), 'evidence', 'vision-benchmark')
  );
}

function authorize(request: Request): 'ok' | 'disabled' | 'denied' {
  const expectedToken = process.env.VISION_BENCHMARK_API_TOKEN;

  if (!expectedToken) {
    return 'disabled';
  }

  const authorization = request.headers.get('authorization');
  const suppliedToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);

  if (expected.length !== supplied.length) {
    return 'denied';
  }

  return timingSafeEqual(expected, supplied) ? 'ok' : 'denied';
}

export async function GET(): Promise<NextResponse> {
  try {
    const evidence = await evidenceStore().readAll();
    const rows = rankVisionDashboardRows(
      evidence.map(toVisionDashboardRow)
    );

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Vision benchmark evidence could not be loaded.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = authorize(request);

  if (authorization === 'disabled') {
    return NextResponse.json(
      {
        success: false,
        error: 'Vision benchmark API execution is disabled.',
      },
      { status: 503 }
    );
  }

  if (authorization === 'denied') {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized.',
      },
      { status: 401 }
    );
  }

  try {
    const evidence = await runVisionBenchmarkRequest(
      await request.json(),
      {
        repositoryRoot: process.cwd(),
      }
    );
    const storedAt = await evidenceStore().save(evidence);

    return NextResponse.json({
      success: true,
      data: {
        evidence,
        dashboard: toVisionDashboardRow(evidence),
        storedAt: path.relative(process.cwd(), storedAt),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error.',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Vision benchmark execution failed.',
      },
      { status: 500 }
    );
  }
}
