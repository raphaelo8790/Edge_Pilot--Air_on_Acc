/**
 * GET /api/v1/health/database — is the database actually reachable, and what
 * is in it?
 *
 * WHY THIS EXISTS. Every failure this project has had with the database looked
 * the same from the outside: a 503 from /workloads with the words "Database
 * unavailable", which does not distinguish "Postgres is not running" from
 * "the container is up but no migration has been applied" from "DATABASE_URL
 * points at a different database than you think". This answers all three, and
 * it answers them from inside the running application, which is the only place
 * the answer is authoritative — a `psql` session from another shell can reach
 * a database the app is not configured for.
 *
 * WHAT IT DOES NOT RETURN. No user, no password, no query string. There is no
 * sign-in on this application, so anything here is readable by whoever can
 * reach it: the host and database NAME are returned only outside production,
 * where the operator is the visitor. A hosted deployment answers "reachable"
 * or "not reachable" and the counts, and keeps its own address to itself.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logForRequest } from '@/core/logging/sessionLogStore';

export const dynamic = 'force-dynamic';

/** The migrations Prisma has recorded as applied. */
interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

/**
 * Host, port and database name from a connection string — never the
 * credential.
 *
 * Parsed with `new URL` rather than a regular expression, then reassembled
 * from its parts. A regex over a URL that happens to contain a password is
 * one backtrack away from returning the password, and reassembling from named
 * fields cannot: `username` and `password` are simply never read.
 */
function describeConnection(raw: string | undefined): {
  host: string | null;
  database: string | null;
  pooled: boolean | null;
  ssl: boolean | null;
} {
  if (!raw) {
    return { host: null, database: null, pooled: null, ssl: null };
  }

  try {
    const url = new URL(raw);

    return {
      host: url.port ? `${url.hostname}:${url.port}` : url.hostname,
      database: url.pathname.replace(/^\//, '') || null,
      // A pooled Neon endpoint has `-pooler` in the hostname. Worth surfacing
      // because migrations cannot run through a pooler, which is the cause of
      // a class of confusing CLI failures.
      pooled: url.hostname.includes('-pooler'),
      ssl: (url.searchParams.get('sslmode') ?? '') !== '',
    };
  } catch {
    return { host: null, database: null, pooled: null, ssl: null };
  }
}

export async function GET(request: Request) {
  const log = logForRequest(request);
  const exposeAddress = process.env.NODE_ENV !== 'production';
  const connection = describeConnection(process.env.DATABASE_URL);

  const startedAt = Date.now();

  try {
    // A real round trip, not a client-object check. `new PrismaClient()`
    // succeeds happily against a database that does not exist; only a query
    // proves anything.
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';

    log?.record('error', 'config', 'Database is not reachable', {
      // The message can contain the host but never the password: Prisma
      // redacts the credential in its own connection errors. It is still
      // withheld in production, where the reader is not necessarily the
      // operator.
      reason: exposeAddress ? message.split('\n')[0] : 'connection refused',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Database not reachable',
        data: {
          connected: false,
          configured: process.env.DATABASE_URL !== undefined,
          ...(exposeAddress ? connection : {}),
          round_trip_ms: null,
          migrations: null,
          rows: null,
        },
        details: exposeAddress
          ? message.split('\n')[0]
          : 'The application could not open a connection to its database.',
        remedy: exposeAddress
          ? 'Start Postgres with `bash setup-db.sh` (or `docker compose up -d postgres`), ' +
            'then apply migrations with `npm run db:deploy`. If you meant the shared ' +
            'remote database, use `npm run db:neon:status` — the app itself always reads .env.'
          : undefined,
      },
      { status: 503 }
    );
  }

  const roundTripMs = Date.now() - startedAt;

  // Counted rather than assumed. An empty _prisma_migrations table on a
  // reachable database is the exact state that produces "the table does not
  // exist" from every other route, and it is invisible from a bare SELECT 1.
  let migrations: {
    applied: number;
    pending_rollback: number;
    latest: string | null;
    latest_at: string | null;
  } | null = null;

  try {
    const rows = await prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      ORDER BY finished_at ASC NULLS LAST
    `;

    const applied = rows.filter(
      (row) => row.finished_at !== null && row.rolled_back_at === null
    );
    const last = applied[applied.length - 1];

    migrations = {
      applied: applied.length,
      pending_rollback: rows.filter((row) => row.rolled_back_at !== null).length,
      latest: last?.migration_name ?? null,
      latest_at: last?.finished_at?.toISOString() ?? null,
    };
  } catch {
    // Reachable but unmigrated. Left as null and reported below rather than
    // failing the whole check — "connected, zero migrations" is a diagnosis,
    // not an error.
    migrations = null;
  }

  // Counts, never contents. This endpoint says whether the database is doing
  // its job; reading anyone's rows is what Prisma Studio is for.
  let rows: Record<string, number> | null = null;

  try {
    const [users, workloads, providers, benchmarks, results, shared] =
      await Promise.all([
        prisma.user.count(),
        prisma.workload.count(),
        prisma.provider.count(),
        prisma.benchmark.count(),
        prisma.benchmarkResult.count(),
        prisma.sharedFinding.count(),
      ]);

    rows = {
      users,
      workloads,
      providers,
      benchmarks,
      benchmark_results: results,
      shared_findings: shared,
    };
  } catch {
    rows = null;
  }

  log?.record('info', 'config', 'Database reachable', {
    round_trip_ms: roundTripMs,
    migrations_applied: migrations?.applied ?? 0,
    ...(exposeAddress ? { host: connection.host, database: connection.database } : {}),
  });

  return NextResponse.json({
    success: true,
    data: {
      connected: true,
      configured: true,
      ...(exposeAddress
        ? connection
        : { host: null, database: null, pooled: null, ssl: null }),
      round_trip_ms: roundTripMs,
      migrations,
      rows,
    },
    meta: {
      // Said plainly, because "connected" and "usable" are not the same thing
      // and the difference is what wasted an afternoon.
      message:
        migrations === null
          ? 'Connected, but the _prisma_migrations table could not be read. The schema ' +
            'has probably never been applied to this database — run `npm run db:deploy`.'
          : migrations.applied === 0
            ? 'Connected, but no migration has been applied. Every table is missing. ' +
              'Run `npm run db:deploy`.'
            : undefined,
      address_withheld: !exposeAddress,
      viewer: exposeAddress
        ? 'To browse the rows themselves: `npm run db:studio` (this database), or ' +
          '`npm run db:neon:studio` (the shared remote one).'
        : undefined,
    },
  });
}
