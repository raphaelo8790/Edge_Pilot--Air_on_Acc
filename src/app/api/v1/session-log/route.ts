/**
 * GET    /api/v1/session-log — export this session's activity as JSON.
 * DELETE /api/v1/session-log — discard it.
 *
 * The session is identified by the `x-edgepilot-session` header, which the
 * client generates. There is no account, no cookie and no server-assigned
 * identity: a caller that stops sending the header simply has no log.
 *
 * GET returns a downloadable document rather than an API envelope, because
 * the point of it is to be saved and attached to something. The `disclosure`
 * block travels inside the file, so a copy that changes hands still states
 * what was and was not recorded.
 */

import { NextResponse } from 'next/server';
import {
  SESSION_HEADER,
  sessionLogStore,
} from '@/core/logging/sessionLogStore';

export const dynamic = 'force-dynamic';

function sessionIdOf(request: Request): string | null {
  const value = request.headers.get(SESSION_HEADER)?.trim();
  return value && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

export async function GET(request: Request) {
  const sessionId = sessionIdOf(request);

  if (!sessionId) {
    return NextResponse.json(
      {
        success: false,
        error: 'No session',
        details: `Send an ${SESSION_HEADER} header (8-64 characters, letters, digits, hyphen or underscore) to collect and export a log.`,
      },
      { status: 400 }
    );
  }

  const log = sessionLogStore.get(sessionId);

  if (!log) {
    return NextResponse.json(
      {
        success: false,
        error: 'Nothing recorded',
        details:
          'The log starts empty and fills as you use the application \u2014 ' +
          'registering a workload, checking the local runtime, running a ' +
          'benchmark, a comparison or a vision run all write to it. It is kept ' +
          'in this server\u2019s memory only, so it is discarded when the server ' +
          'restarts or after a period of inactivity.',
      },
      { status: 404 }
    );
  }

  const document = log.export();

  return new NextResponse(JSON.stringify(document, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="edgepilot-session-${sessionId}.json"`,
      'cache-control': 'no-store',
    },
  });
}

export async function DELETE(request: Request) {
  const sessionId = sessionIdOf(request);

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: 'No session' },
      { status: 400 }
    );
  }

  sessionLogStore.close(sessionId);

  return NextResponse.json({
    success: true,
    data: { session_id: sessionId, discarded: true },
  });
}
