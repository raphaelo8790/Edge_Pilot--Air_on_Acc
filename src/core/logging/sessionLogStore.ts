/**
 * The process-wide session log store.
 *
 * Cached on globalThis for the same reason the Prisma client is: Next.js
 * hot-reloads modules in development, and a fresh store per reload would drop
 * every session log mid-use.
 *
 * Logging is OPT-IN by header. A request without `x-edgepilot-session` is not
 * logged at all - not logged anonymously, not logged to a default bucket.
 * That keeps the default behaviour of this application "we kept no record of
 * what you ran", which is the only default consistent with the rest of it.
 */

import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  MemorySessionLogStore,
  type SessionLog,
  type SessionLogStore,
} from './SessionLog';
import { PrismaSessionLogStore } from './PrismaSessionLogStore';

const globalForLogs = globalThis as unknown as {
  edgepilotSessionLogs: SessionLogStore | undefined;
};

/**
 * Database-backed whenever a database is configured; memory otherwise (tests,
 * and a checkout with no DATABASE_URL). Hosted, memory alone loses the log
 * between requests - see PrismaSessionLogStore.
 */
function createStore(): SessionLogStore {
  const configured = (process.env.DATABASE_URL ?? '').trim() !== '';
  return configured && process.env.NODE_ENV !== 'test'
    ? new PrismaSessionLogStore(prisma)
    : new MemorySessionLogStore();
}

export const sessionLogStore: SessionLogStore =
  globalForLogs.edgepilotSessionLogs ?? createStore();

if (process.env.NODE_ENV !== 'production') {
  globalForLogs.edgepilotSessionLogs = sessionLogStore;
}

export const SESSION_HEADER = 'x-edgepilot-session';
export const PROMPT_TEXT_HEADER = 'x-edgepilot-log-prompts';

/** A session id we are willing to key a log on. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Resolves the log for a request, or null when the caller did not ask for one.
 *
 * The id is validated rather than trusted: it becomes a Map key and appears in
 * an exported document, so an arbitrary string from a header has no business
 * being either.
 */
export function logForRequest(request: Request): SessionLog | null {
  const sessionId = request.headers.get(SESSION_HEADER)?.trim();

  const includePromptText =
    request.headers.get(PROMPT_TEXT_HEADER)?.trim().toLowerCase() === 'true';

  return logForSession(sessionId, { includePromptText });
}

/**
 * The same resolution, for callers that have a session id but not a Request.
 *
 * Server actions are the reason this exists. Next.js exposes them as its own
 * POST endpoint, and the client component calling one is not going through
 * the typed API client, so no `x-edgepilot-session` header is attached. The
 * id is therefore passed as an ordinary argument - which keeps the same rule
 * intact either way: no id, no log, and nothing is recorded anonymously.
 *
 * The id is still validated here rather than at the call site, because a
 * value that arrives as a function argument is no more trustworthy than one
 * that arrives as a header.
 */
export function logForSession(
  sessionId: string | null | undefined,
  options: { includePromptText?: boolean } = {}
): SessionLog | null {
  const id = sessionId?.trim();

  if (!id || !SESSION_ID_PATTERN.test(id)) {
    return null;
  }

  // Persisted writes are queued as events are recorded and settled after the
  // response has gone out - the window a hosted function stays alive for.
  // Outside a request (a script, a test) `after` throws; the memory store
  // needs no flush and the database store flushes on its next read.
  try {
    after(() => sessionLogStore.flush());
  } catch {
    /* not in a request context */
  }

  return sessionLogStore.open(id, {
    includePromptText: options.includePromptText ?? false,
  });
}
