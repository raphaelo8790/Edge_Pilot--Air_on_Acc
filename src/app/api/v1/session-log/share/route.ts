/**
 * GET  /api/v1/session-log/share — preview exactly what sharing would send.
 * POST /api/v1/session-log/share — send it, on an explicit confirmation.
 *
 * The preview and the upload call the same builder, so the preview is not a
 * description of the payload — it IS the payload. Anything else drifts.
 *
 * POST requires `confirm: true` in the body. A request without it is refused
 * and returns the preview instead, so "share" can never happen as a side
 * effect of some other call. The consent wording the user agreed to is stored
 * on the row rather than living only in whatever the interface said that day.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  buildSharePayload,
  SHARE_CONSENT_STATEMENT,
} from '@/core/logging/SessionLog';
import {
  SESSION_HEADER,
  logForRequest,
  sessionLogStore,
} from '@/core/logging/sessionLogStore';

export const dynamic = 'force-dynamic';

const ShareSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({
      message:
        'Sharing requires confirm: true. Call GET on this endpoint first to see exactly what would be sent.',
    }),
  }),
  note: z.string().max(2000).optional(),
});

function sessionIdOf(request: Request): string | null {
  const value = request.headers.get(SESSION_HEADER)?.trim();
  return value && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

function noSession() {
  return NextResponse.json(
    {
      success: false,
      error: 'No session',
      details: `Send an ${SESSION_HEADER} header identifying the session to share.`,
    },
    { status: 400 }
  );
}

function nothingRecorded() {
  return NextResponse.json(
    {
      success: false,
      error: 'Nothing recorded',
      details:
        'This session has no activity to share. The log starts empty and ' +
        'fills as you register a workload, check the local runtime, or run a ' +
        'benchmark or comparison.',
    },
    { status: 404 }
  );
}

export async function GET(request: Request) {
  const sessionId = sessionIdOf(request);

  if (!sessionId) {
    return noSession();
  }

  const log = await sessionLogStore.load(sessionId);

  if (!log) {
    return nothingRecorded();
  }

  return NextResponse.json({
    success: true,
    data: {
      consent_statement: SHARE_CONSENT_STATEMENT,
      would_send: buildSharePayload(log),
    },
  });
}

export async function POST(request: Request) {
  const sessionId = sessionIdOf(request);

  if (!sessionId) {
    return noSession();
  }

  const log = await sessionLogStore.load(sessionId);

  if (!log) {
    return nothingRecorded();
  }

  let parsed;

  try {
    parsed = ShareSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Confirmation required',
          details: error.errors[0]?.message ?? 'confirm: true is required.',
          data: {
            consent_statement: SHARE_CONSENT_STATEMENT,
            would_send: buildSharePayload(log),
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Malformed request body' },
      { status: 400 }
    );
  }

  const payload = buildSharePayload(log);

  try {
    const row = await prisma.sharedFinding.create({
      data: {
        sessionId,
        schemaVersion: payload.schema,
        payload: payload as unknown as object,
        eventCount: payload.event_count,
        note: parsed.note ?? null,
        consentStatement: SHARE_CONSENT_STATEMENT,
      },
      select: { id: true, createdAt: true },
    });

    // Recorded through the RECORDING log (the one with a persistence sink),
    // not the loaded read-only copy the payload was built from.
    logForRequest(request)?.record(
      'info',
      'config',
      'Session log shared with the maintainers',
      { shared_id: row.id, event_count: payload.event_count }
    );

    return NextResponse.json({
      success: true,
      data: {
        shared_id: row.id,
        shared_at: row.createdAt,
        event_count: payload.event_count,
        // Echo what was stored so the user has a record of their own.
        sent: payload,
      },
    });
  } catch (error) {
    console.error('Share findings error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Could not store the shared findings',
        details:
          'The database did not accept the record. Nothing was sent, and your local log is unchanged.',
      },
      { status: 503 }
    );
  }
}
