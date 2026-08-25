/**
 * GET /api/v1/readiness/[id] — the readiness score recorded for one benchmark.
 *
 * `[id]` is the benchmark id, not the readiness-score id: readiness_scores has
 * a unique benchmark_id, and the caller holds a benchmark id.
 *
 * The stored `limitations` array carries the assumption lines the run was
 * scored under, each prefixed `ASSUMPTION:`. They are split back out here so a
 * client does not have to know about the prefix — a score must never be read
 * without the caveats it was computed under.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { benchmarkRepository } from '@/modules/benchmark/infrastructure/container';

export const dynamic = 'force-dynamic';

const ASSUMPTION_PREFIX = 'ASSUMPTION: ';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: 'The benchmark id must be a uuid.',
        },
        { status: 400 }
      );
    }

    const readiness = await benchmarkRepository().getReadinessScore(id);

    if (readiness === null) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'Readiness score not found',
          message: `No readiness score has been recorded for benchmark ${id}.`,
        },
        { status: 404 }
      );
    }

    const assumptions = readiness.limitations
      .filter((entry) => entry.indexOf(ASSUMPTION_PREFIX) === 0)
      .map((entry) => entry.slice(ASSUMPTION_PREFIX.length));

    const limitations = readiness.limitations.filter(
      (entry) => entry.indexOf(ASSUMPTION_PREFIX) !== 0
    );

    return NextResponse.json({
      success: true,
      data: { ...readiness, limitations, assumptions },
    });
  } catch (error) {
    console.error('Get readiness error:', error);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
