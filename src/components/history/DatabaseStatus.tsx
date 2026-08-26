'use client';

/**
 * Whether the application can actually reach its database, shown in the
 * application rather than in a terminal.
 *
 * WHY IT SITS ON THIS PAGE. The rest of this page is careful to say where
 * each thing lives: the benchmark runs are in this browser, the activity log
 * is in the server's memory. The database is the third place, and until now
 * it was the only one you could not see. "Database unavailable" appearing on
 * some other screen, an hour later, is a bad way to learn that Postgres was
 * never started.
 *
 * It does NOT show any row contents, and it is not a substitute for
 * `npm run db:studio` — it answers "is it connected and migrated", which is
 * the question that was actually being asked.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  getDatabaseHealth,
  type DatabaseHealth,
} from '@/components/dashboard/api';

interface State {
  health: DatabaseHealth | null;
  /** The server's own explanation of a failure, kept verbatim. */
  error: string | null;
  remedy: string | null;
  note: string | null;
  loading: boolean;
}

const initial: State = {
  health: null,
  error: null,
  remedy: null,
  note: null,
  loading: true,
};

/** `unknown` from the wire to a string, without inventing one. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function DatabaseStatus() {
  const [state, setState] = useState<State>(initial);

  // Applies one answer from the server. Only ever called from a promise
  // callback, so it never runs synchronously inside render or an effect.
  const apply = useCallback((outcome: Awaited<ReturnType<typeof getDatabaseHealth>>) => {
    if (outcome.ok) {
      const meta = outcome.meta as Record<string, unknown> | undefined;

      setState({
        health: outcome.data,
        error: null,
        remedy: null,
        // Present when the database answered but has no schema — connected
        // and unusable are different states and both are worth naming.
        note: text(meta?.message),
        loading: false,
      });
      return;
    }

    // A 503 here is not an empty failure: the endpoint still reports what it
    // found. `failedRun` is where the client puts a `data` block that arrived
    // alongside success:false.
    setState({
      health: (outcome.failedRun as unknown as DatabaseHealth) ?? null,
      error: outcome.error,
      remedy: text((outcome as { remedy?: unknown }).remedy),
      note: text(outcome.details),
      loading: false,
    });
  }, []);

  // The initial state is already `loading: true`, so the mount-time check has
  // nothing to set until the answer arrives.
  useEffect(() => {
    void getDatabaseHealth().then(apply);
  }, [apply]);

  // The Retry button: show the spinner again, then ask again.
  const check = useCallback(() => {
    setState((current) => ({ ...current, loading: true }));
    void getDatabaseHealth().then(apply);
  }, [apply]);

  const health = state.health;
  const connected = health?.connected === true;

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
      <div className="border-b border-ink-700 px-6 py-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Database
        </h2>
        <p className="mt-1 text-sm text-mist-400">
          The third place things live. Benchmark runs above are in this
          browser, the activity log is in this server&apos;s memory, and
          workloads and saved benchmark rows are here. Counts only — nothing on
          this page reads anyone&apos;s rows.
        </p>
      </div>

      <div className="px-6 py-5">
        {state.loading && health === null ? (
          <p className="text-sm text-mist-400">Checking…</p>
        ) : (
          <>
            <p className="text-sm">
              <span
                className={
                  connected ? 'font-semibold text-pulse-300' : 'font-semibold'
                }
              >
                {connected ? 'Connected' : 'Not reachable'}
              </span>
              {connected && health?.round_trip_ms !== null &&
              health?.round_trip_ms !== undefined ? (
                <span className="text-mist-400">
                  {' '}
                  — a SELECT 1 round trip took {health.round_trip_ms} ms.
                </span>
              ) : null}
            </p>

            {health?.host ? (
              <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-mist-400">Host</dt>
                  <dd>
                    <code>{health.host}</code>
                    {health.pooled ? ' (pooled)' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-mist-400">Database</dt>
                  <dd>
                    <code>{health.database ?? '—'}</code>
                  </dd>
                </div>
                <div>
                  <dt className="text-mist-400">Migrations applied</dt>
                  <dd>
                    {health.migrations
                      ? `${health.migrations.applied}${
                          health.migrations.latest
                            ? ` — latest ${health.migrations.latest}`
                            : ''
                        }`
                      : 'could not be read'}
                  </dd>
                </div>
                <div>
                  <dt className="text-mist-400">TLS</dt>
                  <dd>{health.ssl ? 'required by the connection string' : 'not requested'}</dd>
                </div>
              </dl>
            ) : null}

            {health?.rows ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700">
                <table className="w-full text-left text-sm">
                  <thead className="ep-mono bg-ink-950/70 text-[11px] uppercase tracking-wider text-mist-500">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Table
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Rows
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(health.rows).map(([table, count]) => (
                      <tr key={table} className="border-t border-ink-800">
                        <td className="px-5 py-2">
                          <code>{table}</code>
                        </td>
                        <td className="px-5 py-2 tabular-nums">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {state.error ? (
              <div className="callout mt-4" role="status">
                {state.error}
                {state.note ? <> — {state.note}</> : null}
              </div>
            ) : state.note ? (
              <div className="callout mt-4" role="status">
                {state.note}
              </div>
            ) : null}

            {state.remedy ? (
              <p className="mt-3 text-sm text-mist-400">{state.remedy}</p>
            ) : null}

            <p className="mt-4 text-sm text-mist-400">
              To browse the rows themselves, run <code>npm run db:studio</code>{' '}
              and open <code>http://localhost:5555</code>. That reads whichever
              database <code>.env</code> points at — the same one this panel
              just checked.
            </p>
          </>
        )}

        <div className="btn-row mt-4">
          <button
            type="button"
            className="btn"
            disabled={state.loading}
            onClick={() => void check()}
          >
            {state.loading ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    </section>
  );
}
