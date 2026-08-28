/**
 * The database-backed store, against a fake Prisma client. What matters:
 * every recorded event reaches storage, an export reads back everything the
 * session ever recorded (not just this process's memory), discard deletes,
 * and a failing database never throws into the caller.
 */

import { PrismaSessionLogStore } from '@/core/logging/PrismaSessionLogStore';

interface Row {
  id: string;
  sessionId: string;
  at: Date;
  level: string;
  category: string;
  message: string;
  correlationId: string | null;
  data: unknown;
}

function fakePrisma(options: { failing?: boolean } = {}) {
  const rows: Row[] = [];
  let next = 1;
  const fail = () => Promise.reject(new Error('database unavailable'));

  const client = {
    sessionEvent: {
      create: async ({ data }: { data: Row | Omit<Row, 'id'> }) => {
        if (options.failing) return fail();
        const row = 'id' in data ? (data as Row) : { id: String(next++), ...data };
        rows.push(row);
        return row;
      },
      findMany: async ({ where, take }: { where: { sessionId: string }; take: number }) => {
        if (options.failing) return fail();
        return rows
          .filter((r) => r.sessionId === where.sessionId)
          .sort(
            (a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id)
          )
          .slice(0, take);
      },
      deleteMany: async ({ where }: { where: { sessionId?: string; at?: { lt: Date } } }) => {
        if (options.failing) return fail();
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const r = rows[i];
          if ((where.sessionId && r.sessionId === where.sessionId) || (where.at && r.at < where.at.lt)) {
            rows.splice(i, 1);
          }
        }
        return { count: before - rows.length };
      },
    },
  };

  return { client: client as never, rows };
}

describe('PrismaSessionLogStore', () => {
  it('persists every recorded event and reads them all back for an export', async () => {
    const { client, rows } = fakePrisma();
    const store = new PrismaSessionLogStore(client);

    store.open('session-a').record('info', 'config', 'Workload registered', { workload_id: 'w1' });
    store.open('session-a').record('info', 'benchmark', 'Measured llama3.2', { latency: 12 });
    await store.flush();

    expect(rows).toHaveLength(2);

    // A different process: nothing in memory, everything in storage.
    const elsewhere = new PrismaSessionLogStore(client);
    const loaded = await elsewhere.load('session-a');

    expect(loaded).not.toBeNull();
    const exported = loaded!.export();
    expect(exported.event_count).toBe(2);
    expect(exported.events.map((e) => e.message)).toEqual([
      'Workload registered',
      'Measured llama3.2',
    ]);
    expect(exported.disclosure.join(' ')).not.toContain('memory only');
  });

  it('keeps sessions apart and discards only the one asked for', async () => {
    const { client, rows } = fakePrisma();
    const store = new PrismaSessionLogStore(client);

    store.open('a').record('info', 'config', 'one');
    store.open('b').record('info', 'config', 'two');
    await store.discard('a');

    expect(rows.map((r) => r.sessionId)).toEqual(['b']);
    expect(await store.load('a')).toBeNull();
    expect((await store.load('b'))!.size()).toBe(1);
  });

  it('never throws when the database is down, and falls back to memory on read', async () => {
    const { client } = fakePrisma({ failing: true });
    const store = new PrismaSessionLogStore(client);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => store.open('a').record('info', 'config', 'still recorded')).not.toThrow();
    await expect(store.flush()).resolves.toBeUndefined();

    const loaded = await store.load('a');
    expect(loaded!.size()).toBe(1);

    await expect(store.discard('a')).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
