/**
 * The session log, kept in the database.
 *
 * WHY. `MemorySessionLogStore` holds each session's events in the server
 * process. That was the right shape for one long-lived process on a laptop,
 * and the wrong one the moment the app was hosted: a serverless request can
 * land on any instance, none of them keep memory between calls, and a log
 * recorded in one place was simply not there when the visitor asked another
 * place to export it. The first hosted export came back with two events out
 * of a whole session. This store writes every event to `session_events` as
 * it is recorded and reads them all back for an export.
 *
 * HOW THE WRITE HAPPENS. `SessionLog.record` is synchronous and must stay so
 * - a benchmark route records a dozen times and must not wait on the
 * database each time. So the log hands each event to a sink, the sink
 * queues an insert, and `flush()` awaits the queue. `sessionLogStore.ts`
 * arranges for `flush()` to run after the response is sent (Next's
 * `after`), which is the window a hosted function is kept alive for.
 *
 * WHAT IS STORED. Exactly what the memory store held: the redacted event.
 * Prompt text never reaches this file - `digestPrompt` ran before `record`
 * was called. Rows carry the browser's own session id and nothing else that
 * identifies anyone. Rows older than the retention window are pruned on
 * read; `discard` deletes a session's rows outright.
 *
 * WHEN THE DATABASE IS DOWN. Writes are dropped with one console warning per
 * session, and reads fall back to whatever this process holds in memory.
 * The log is a convenience for the visitor; it must never be why a run
 * failed.
 */

import type { PrismaClient } from '@prisma/client';
import {
  MemorySessionLogStore,
  SessionLog,
  type SessionEvent,
  type SessionLogOptions,
  type SessionLogStore,
} from './SessionLog';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 500;

export interface PrismaSessionLogStoreOptions extends SessionLogOptions {
  retentionMs?: number;
}

export class PrismaSessionLogStore implements SessionLogStore {
  private readonly memory: MemorySessionLogStore;
  private readonly retentionMs: number;
  private pending: Promise<unknown>[] = [];
  private readonly warned = new Set<string>();

  public constructor(
    private readonly prisma: PrismaClient,
    options: PrismaSessionLogStoreOptions = {}
  ) {
    this.retentionMs = options.retentionMs ?? RETENTION_MS;
    this.memory = new MemorySessionLogStore({
      ...options,
      sink: (sessionId, event) => this.persist(sessionId, event),
    });
  }

  private persist(sessionId: string, event: SessionEvent): void {
    const write = this.prisma.sessionEvent
      .create({
        data: {
          sessionId,
          at: new Date(event.at),
          level: event.level,
          category: event.category,
          message: event.message,
          correlationId: event.correlationId,
          data: event.data as object,
        },
      })
      .catch((error: unknown) => {
        if (!this.warned.has(sessionId)) {
          this.warned.add(sessionId);
          console.warn(
            `[session-log] could not persist events for ${sessionId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      });

    this.pending.push(write);
  }

  public get(sessionId: string): SessionLog | null {
    return this.memory.get(sessionId);
  }

  public open(sessionId: string, options: SessionLogOptions = {}): SessionLog {
    return this.memory.open(sessionId, options);
  }

  public close(sessionId: string): void {
    this.memory.close(sessionId);
  }

  public count(): number {
    return this.memory.count();
  }

  public async flush(): Promise<void> {
    const inFlight = this.pending;
    this.pending = [];
    await Promise.all(inFlight);
  }

  public async load(sessionId: string): Promise<SessionLog | null> {
    await this.flush();

    let rows: Array<{
      at: Date;
      level: string;
      category: string;
      message: string;
      correlationId: string | null;
      data: unknown;
    }>;

    try {
      // Retention is enforced on read: cheap, and the only moment it matters.
      await this.prisma.sessionEvent.deleteMany({
        where: { at: { lt: new Date(Date.now() - this.retentionMs) } },
      });

      rows = await this.prisma.sessionEvent.findMany({
        where: { sessionId },
        orderBy: { at: 'desc' },
        take: MAX_EVENTS,
      });
    } catch (error) {
      console.warn(
        `[session-log] could not read events for ${sessionId}; using memory: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return this.memory.get(sessionId);
    }

    if (rows.length === 0) {
      return this.memory.get(sessionId);
    }

    rows.reverse();

    const events: SessionEvent[] = rows.map((row) => ({
      at: row.at.toISOString(),
      level: row.level as SessionEvent['level'],
      category: row.category as SessionEvent['category'],
      message: row.message,
      correlationId: row.correlationId,
      data: (row.data ?? {}) as Record<string, unknown>,
    }));

    // A fresh object rather than the recording one: hydrating the log the
    // routes record into would re-emit every event through the sink.
    const log = new SessionLog(sessionId, events[0].at, {
      maxEvents: MAX_EVENTS,
      includePromptText: this.memory.get(sessionId)?.includePromptText ?? false,
    });
    log.hydrate(events);
    return log;
  }

  public async discard(sessionId: string): Promise<void> {
    this.memory.close(sessionId);

    try {
      await this.flush();
      await this.prisma.sessionEvent.deleteMany({ where: { sessionId } });
    } catch (error) {
      console.warn(
        `[session-log] could not delete events for ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
