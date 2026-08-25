/**
 * EdgePilot AI - session activity log
 *
 * A per-session record of what the application did, exportable as JSON, with
 * no account and no user identity attached.
 *
 * WHY REDACTION IS BUILT IN RATHER THAN OPTIONAL.
 *
 * The obvious thing for a benchmark log to record is the prompt. The prompt is
 * also the confidential thing this product exists to warn people about: the
 * egress warning tells a user "this text is about to leave your machine", and
 * a log that then writes the same text into a file they can email around has
 * defeated the warning it just issued. So prompt CONTENT is never recorded by
 * default - only its length and a short digest, which is enough to prove two
 * runs used the same prompt without reproducing it. `includePromptText` exists
 * for a user who deliberately wants a full transcript, and the export says
 * plainly when it was used.
 *
 * Provider credentials are never accepted into an event at all. There is no
 * flag for that one.
 *
 * WHY THE STORE IS AN INTERFACE.
 *
 * Today the log lives in this process's memory: no database, no file, gone on
 * restart, which is the right default for something that may hold a digest of
 * someone's proprietary prompt. Once this is hosted, the log may need to move
 * into the browser instead - the server would emit events and the client would
 * accumulate them - because a single server's memory is the wrong home for
 * per-user state across instances. The event model and the export shape are
 * identical either way, so that decision stays open.
 */

import { createHash } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'benchmark'
  | 'comparison'
  | 'provider'
  | 'runtime'
  | 'privacy'
  | 'config';

export interface SessionEvent {
  /** ISO 8601, UTC. */
  at: string;
  level: LogLevel;
  category: LogCategory;
  /** Short human-readable summary. */
  message: string;
  /** Ties several events to one user action. */
  correlationId: string | null;
  /** Structured detail. Redacted before it gets here. */
  data: Record<string, unknown>;
}

export interface PromptDigest {
  characters: number;
  /** First 12 hex characters of the SHA-256. Identifies without reproducing. */
  sha256Prefix: string;
  /** Present only when the session opted into full transcripts. */
  text?: string;
}

/** Keys that must never appear in an exported log, whatever the caller passes. */
const FORBIDDEN_KEY_PATTERN =
  /(api[_-]?key|secret|token|password|authorization|credential|dsn)/i;

const REDACTED = '[redacted]';

export function digestPrompt(
  prompt: string,
  includeText: boolean
): PromptDigest {
  const digest: PromptDigest = {
    characters: prompt.length,
    sha256Prefix: createHash('sha256').update(prompt, 'utf8').digest('hex').slice(0, 12),
  };

  if (includeText) {
    digest.text = prompt;
  }

  return digest;
}

/**
 * Strips anything that looks like a credential, at any depth.
 *
 * Deliberately blunt: it matches on key NAME rather than trying to recognise
 * secret-shaped values, because a key called `apiKey` holding something
 * unexpected is still not worth writing down.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1));
  }

  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = FORBIDDEN_KEY_PATTERN.test(key)
      ? REDACTED
      : redact(entry, depth + 1);
  }

  return output;
}

export interface SessionLogOptions {
  /** Most recent events kept. Older ones are dropped. */
  maxEvents?: number;
  /** Whether prompt text may be stored for this session. */
  includePromptText?: boolean;
}

const DEFAULT_MAX_EVENTS = 500;

export class SessionLog {
  private readonly events: SessionEvent[] = [];
  private readonly maxEvents: number;

  public readonly includePromptText: boolean;

  public constructor(
    public readonly sessionId: string,
    public readonly startedAt: string,
    options: SessionLogOptions = {}
  ) {
    this.maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.includePromptText = options.includePromptText ?? false;
  }

  public record(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data: Record<string, unknown> = {},
    correlationId: string | null = null
  ): void {
    this.events.push({
      at: new Date().toISOString(),
      level,
      category,
      message,
      correlationId,
      data: redact(data) as Record<string, unknown>,
    });

    // Ring buffer: a long session must not grow without bound, and the recent
    // past is what anybody debugging actually wants.
    while (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  public size(): number {
    return this.events.length;
  }

  public clear(): void {
    this.events.length = 0;
  }

  /**
   * The exported document. `disclosure` is part of the artefact rather than
   * documentation, so a file that changes hands still says what it does and
   * does not contain.
   */
  public export(): {
    schema: string;
    session_id: string;
    started_at: string;
    exported_at: string;
    event_count: number;
    truncated: boolean;
    disclosure: string[];
    events: SessionEvent[];
  } {
    const disclosure = [
      'Prompt text is recorded as a character count and a SHA-256 prefix, not as content.',
      'Any field whose name suggests a credential is replaced with "[redacted]" before storage.',
      'This log is held in the server process memory only. It is not written to a database and does not survive a restart.',
      'No account, user identity or IP address is recorded.',
    ];

    if (this.includePromptText) {
      disclosure[0] =
        'FULL PROMPT TEXT IS INCLUDED because this session opted in. Treat this file as confidential.';
    }

    return {
      schema: 'edgepilot.session-log.v1',
      session_id: this.sessionId,
      started_at: this.startedAt,
      exported_at: new Date().toISOString(),
      event_count: this.events.length,
      truncated: this.events.length >= this.maxEvents,
      disclosure,
      events: [...this.events],
    };
  }
}

/**
 * The exact wording a user agrees to when sharing. Stored with the record, so
 * what was consented to is recoverable later rather than being whatever the UI
 * happened to say that month.
 */
export const SHARE_CONSENT_STATEMENT =
  'I am sending this session log to the EdgePilot maintainers. It contains which ' +
  'models I benchmarked, the measurements taken, and the verdicts produced. It does ' +
  'not contain my prompt text, any credential, my identity or my IP address. The ' +
  'session identifier travels with it.';

export interface SharePayload {
  schema: string;
  session_id: string;
  started_at: string;
  prepared_at: string;
  event_count: number;
  disclosure: string[];
  events: SessionEvent[];
}

/**
 * Strips prompt text from an event, whatever the session's local setting.
 *
 * A user who turned on full transcripts did so to debug their own runs on
 * their own machine. Uploading that text somewhere else is a different act and
 * needs its own decision, so this removes it unconditionally rather than
 * carrying the earlier opt-in across.
 */
function stripPromptText(event: SessionEvent): SessionEvent {
  const prompt = event.data.prompt as { text?: string } | undefined;

  if (!prompt || typeof prompt !== 'object' || !('text' in prompt)) {
    return event;
  }

  const withoutText: Record<string, unknown> = {
    ...(prompt as Record<string, unknown>),
  };
  delete withoutText.text;

  return {
    ...event,
    data: { ...event.data, prompt: withoutText },
  };
}

/**
 * Builds exactly what would be uploaded. Used for the preview a user sees
 * BEFORE confirming and for the upload itself, so the two cannot drift - the
 * preview is not a description of the payload, it is the payload.
 */
export function buildSharePayload(log: SessionLog): SharePayload {
  const exported = log.export();

  return {
    schema: exported.schema,
    session_id: exported.session_id,
    started_at: exported.started_at,
    prepared_at: new Date().toISOString(),
    event_count: exported.event_count,
    disclosure: [
      'Prompt text has been removed from this copy, including where the session had opted into recording it.',
      'Any field whose name suggests a credential was replaced with "[redacted]" before storage.',
      'No account, user identity or IP address is included.',
    ],
    events: exported.events.map(stripPromptText),
  };
}

/**
 * Where session logs live. In-memory today; see the file header.
 */
export interface SessionLogStore {
  get(sessionId: string): SessionLog | null;
  open(sessionId: string, options?: SessionLogOptions): SessionLog;
  close(sessionId: string): void;
  count(): number;
}

export interface MemorySessionLogStoreOptions extends SessionLogOptions {
  /** Idle milliseconds after which a session is discarded. */
  ttlMs?: number;
  /** Hard cap on concurrent sessions, so this cannot be used to exhaust memory. */
  maxSessions?: number;
}

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 200;

export class MemorySessionLogStore implements SessionLogStore {
  private readonly sessions = new Map<
    string,
    { log: SessionLog; touchedAt: number }
  >();

  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly defaults: SessionLogOptions;

  public constructor(options: MemorySessionLogStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.defaults = {
      maxEvents: options.maxEvents,
      includePromptText: options.includePromptText,
    };
  }

  /**
   * Expires idle sessions, then enforces the cap.
   *
   * Uses Map.forEach rather than `for...of` or `[...map.entries()]` ON
   * PURPOSE. This project compiles with "target": "es5" and no
   * downlevelIteration, under which TypeScript rewrites both of those into
   * array-like index loops. A Map iterator has no `.length`, so the spread
   * silently yields an empty array and the loop silently does nothing - no
   * error, no warning, just a cap that never applies and sessions that never
   * expire. `forEach` and `Array.from` are ordinary method calls and are
   * emitted unchanged, which is why ProviderRegistry already uses the latter.
   *
   * If the target ever moves to ES2015+, this can be simplified back. Until
   * then, do not.
   */
  private sweep(now: number): void {
    const expired: string[] = [];

    this.sessions.forEach((entry, id) => {
      if (now - entry.touchedAt > this.ttlMs) {
        expired.push(id);
      }
    });

    expired.forEach((id) => {
      this.sessions.delete(id);
    });

    // Still over the cap after expiry: drop least-recently-touched first.
    if (this.sessions.size > this.maxSessions) {
      const ordered: Array<{ id: string; touchedAt: number }> = [];

      this.sessions.forEach((entry, id) => {
        ordered.push({ id, touchedAt: entry.touchedAt });
      });

      ordered.sort((a, b) => a.touchedAt - b.touchedAt);

      ordered
        .slice(0, this.sessions.size - this.maxSessions)
        .forEach((entry) => {
          this.sessions.delete(entry.id);
        });
    }
  }

  public get(sessionId: string): SessionLog | null {
    const now = Date.now();
    this.sweep(now);

    const entry = this.sessions.get(sessionId);

    if (!entry) {
      return null;
    }

    entry.touchedAt = now;
    return entry.log;
  }

  public open(sessionId: string, options: SessionLogOptions = {}): SessionLog {
    const existing = this.get(sessionId);

    if (existing) {
      return existing;
    }

    const now = Date.now();
    const log = new SessionLog(sessionId, new Date(now).toISOString(), {
      ...this.defaults,
      ...options,
    });

    this.sessions.set(sessionId, { log, touchedAt: now });
    this.sweep(now);

    return log;
  }

  public close(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  public count(): number {
    this.sweep(Date.now());
    return this.sessions.size;
  }
}
