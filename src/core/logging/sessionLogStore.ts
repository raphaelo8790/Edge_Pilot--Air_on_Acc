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

import {
  MemorySessionLogStore,
  type SessionLog,
  type SessionLogStore,
} from './SessionLog';

const globalForLogs = globalThis as unknown as {
  edgepilotSessionLogs: SessionLogStore | undefined;
};

export const sessionLogStore: SessionLogStore =
  globalForLogs.edgepilotSessionLogs ?? new MemorySessionLogStore();

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

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return null;
  }

  const includePromptText =
    request.headers.get(PROMPT_TEXT_HEADER)?.trim().toLowerCase() === 'true';

  return sessionLogStore.open(sessionId, { includePromptText });
}
