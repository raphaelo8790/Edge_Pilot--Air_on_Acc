/**
 * POST /api/v1/workloads - create a workload row and return its real uuid.
 * GET  /api/v1/workloads - the workloads belonging to the local user.
 *
 * SANDBOX IMPLEMENTATION. The committed version of this file is a scaffold:
 * it returned the literal string 'temp-workload-id' and never called Prisma,
 * so nothing the dashboard saved ever reached the database, and every
 * benchmark run failed with 404 Workload not found. The original is kept
 * beside this file as route.ts.scaffold.bak.
 *
 * Ownership comes from the caller's session id (see lib/sessionOwner.ts).
 * The browser generates that id once and sends it on every request, so the
 * row belongs to whoever created it without anyone signing up - and without
 * a uuid ever being shown to, or typed by, a user.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { CreateWorkloadSchema } from '@/shared/types/workload';
import { prisma } from '@/lib/prisma';
import {
  missingSession,
  resolveOwnerId,
  sessionIdOf,
} from '@/lib/sessionOwner';

export const dynamic = 'force-dynamic';

function databaseUnavailable(error: unknown) {
  console.error('Workloads route database error:', error);

  return NextResponse.json(
    {
      success: false,
      error: 'Database unavailable',
      detail:
        'Could not reach the workloads table. Check that the Postgres ' +
        'container is running and that migrations have been applied.',
    },
    { status: 503 }
  );
}

export async function POST(request: Request) {
  const sessionId = sessionIdOf(request);

  if (sessionId === null) {
    return missingSession();
  }

  let validatedData;

  try {
    validatedData = CreateWorkloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Malformed request body' },
      { status: 400 }
    );
  }

  try {
    const userId = await resolveOwnerId(sessionId);

    const created = await prisma.workload.create({
      data: {
        taskType: validatedData.task_type,
        inputFormat: validatedData.input_format,
        outputFormat: validatedData.output_format,
        constraints: validatedData.constraints as Prisma.InputJsonObject,
        userId,
      },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Workload created',
      data: {
        workload_id: created.id,
        ...validatedData,
      },
    });
  } catch (error) {
    return databaseUnavailable(error);
  }
}

export async function GET(request: Request) {
  const sessionId = sessionIdOf(request);

  if (sessionId === null) {
    return missingSession();
  }

  try {
    const userId = await resolveOwnerId(sessionId);

    const workloads = await prisma.workload.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: workloads.map((row) => ({
        workload_id: row.id,
        task_type: row.taskType,
        input_format: row.inputFormat,
        output_format: row.outputFormat,
        constraints: row.constraints,
      })),
    });
  } catch (error) {
    return databaseUnavailable(error);
  }
}
