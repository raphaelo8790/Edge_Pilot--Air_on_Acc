/**
 * Who owns the rows a request creates.
 *
 * There are no accounts. The browser generates a durable id, stores it, and
 * sends it on every call (src/components/dashboard/session.ts). This turns
 * that id into a User row, creating one the first time it is seen.
 *
 * WHY THIS REPLACED A HARDCODED LOCAL USER. Both of these routes previously
 * attributed every row to one shared `local-sandbox@edgepilot.invalid` user,
 * with a comment saying session handling did not exist yet. It does now. The
 * old behaviour was harmless on one machine and wrong the moment this is
 * hosted: GET would hand every visitor every other visitor's workloads,
 * because they would all be the same user.
 *
 * WHY A MISSING HEADER IS REFUSED RATHER THAN DEFAULTED. Falling back to a
 * shared user is exactly the leak described above, and it fails silently -
 * the caller gets a 200 and someone else's data. Refusing is loud, and the
 * only caller that matters already sends the header on every request.
 *
 * WHY users.email IS NOT SET. It is nullable as of
 * 20260822081030_optional_email_and_session_owner precisely so a session can
 * own rows without an address being invented for it. Do not synthesise one.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SESSION_HEADER } from '@/core/logging/sessionLogStore';

/** The same shape sessionLogStore accepts, for one meaning of "a session". */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The session id on a request, or null when it is absent or malformed. It is
 * validated rather than trusted: it reaches a unique database column, so an
 * arbitrary header value has no business going straight there.
 */
export function sessionIdOf(request: Request): string | null {
  const value = request.headers.get(SESSION_HEADER)?.trim();

  return value && SESSION_ID_PATTERN.test(value) ? value : null;
}

/**
 * The user id for a session, created on first sight.
 *
 * upsert rather than findFirst-then-create: two requests from a new browser
 * can arrive together, and the unique index on session_id would reject the
 * loser of that race. upsert lets the database settle it.
 */
export async function resolveOwnerId(sessionId: string): Promise<string> {
  const user = await prisma.user.upsert({
    where: { sessionId },
    update: {},
    create: { sessionId },
    select: { id: true },
  });

  return user.id;
}

/** The refusal, worded for whoever is reading the network tab. */
export function missingSession(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'No session',
      details:
        `This request carried no ${SESSION_HEADER} header, so there is no ` +
        'owner to attribute the row to. The dashboard sends one automatically; ' +
        'a direct caller should send any stable string of 8-64 characters ' +
        '(letters, digits, hyphen or underscore).',
    },
    { status: 400 }
  );
}
