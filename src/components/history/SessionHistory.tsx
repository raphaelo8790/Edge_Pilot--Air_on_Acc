'use client';

/**
 * Everything this session produced, in one place.
 *
 * THE PAGE IS ORGANISED BY WHERE DATA GOES, not by what kind of data it is.
 * One section never leaves the machine; the other only leaves on an explicit
 * confirmation. That split is the point — a history page that mixed "saved
 * locally" and "sent to the maintainers" into one list would make the second
 * easy to do by accident.
 *
 * The session id is never rendered. It is the browser's own ownership key, and
 * a user should no more be shown it than be shown their cookie — the same rule
 * components/dashboard/session.ts states.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { DatabaseStatus } from './DatabaseStatus';
import {
  downloadSessionLog,
  getSharePreview,
  shareSessionLog,
  type SharePreview,
} from '@/components/dashboard/api';
import { VISION_DATASET_ID } from '@/modules/vision-benchmark/core/types';
import {
  readRuns,
  readBenchmarkRuns,
  clearBenchmarkRuns,
  readComparisonRuns,
  clearComparisonRuns,
  type StoredVisionRun,
  type StoredBenchmarkRun,
  type StoredComparisonRun,
} from '@/components/vision/runHistory';

const notReported = '—';

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function ms(value: number | null | undefined): string {
  return typeof value === 'number' ? `${value.toFixed(0)} ms` : notReported;
}

function saveJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * A run against a dataset the visitor supplied carries THEIR filenames as
 * sample ids, THEIR folder names as labels, and the model's description of
 * THEIR images. None of that is ours to receive, so those runs are
 * download-only and the reason is shown rather than left implicit.
 */
function isShareable(run: StoredVisionRun): boolean {
  return run.evidence.datasetId === VISION_DATASET_ID;
}

export function SessionHistory() {
  const [runs, setRuns] = useState<StoredVisionRun[]>([]);
  const [benchRuns, setBenchRuns] = useState<StoredBenchmarkRun[]>([]);
  const [comparisons, setComparisons] = useState<StoredComparisonRun[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRuns(readRuns());
    setBenchRuns(readBenchmarkRuns());
    setComparisons(readComparisonRuns());
  }, []);

  const shareable = useMemo(() => runs.filter(isShareable).length, [runs]);

  const toggle = useCallback((key: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const chosen = runs.filter((run) => selected.has(run.storedAt));

  function downloadChosen(list: StoredVisionRun[], label: string) {
    if (list.length === 0) return;

    if (list.length === 1) {
      saveJson(
        `edgepilot-vision-${list[0].evidence.model.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`,
        list[0].evidence
      );
      return;
    }

    // A bundle rather than a burst of downloads: browsers block the second and
    // subsequent saves when a click triggers several at once.
    saveJson(`edgepilot-vision-${label}-${list.length}-runs.json`, {
      exported_at: new Date().toISOString(),
      run_count: list.length,
      note: 'Vision benchmark runs exported from this browser. Each entry is a complete evidence document in the same shape the CLI writes.',
      runs: list.map((run) => run.evidence),
    });
  }

  /**
   * `error` is the short label; `details` is the sentence that says what to do
   * about it. Showing only the first turns "Nothing recorded" into a dead end,
   * which is exactly how this page read before.
   */
  function describe(failure: { error: string; details?: unknown }): string {
    return typeof failure.details === 'string'
      ? `${failure.error}. ${failure.details}`
      : failure.error;
  }

  async function loadPreview() {
    setBusy(true);
    setStatus(null);
    const outcome = await getSharePreview();
    setBusy(false);

    if (!outcome.ok) {
      setStatus(describe(outcome));
      return;
    }
    setPreview(outcome.data);
  }

  async function confirmShare() {
    setBusy(true);
    const outcome = await shareSessionLog();
    setBusy(false);

    setStatus(
      outcome.ok
        ? `Sent. ${outcome.data.event_count} events shared at ${new Date(outcome.data.shared_at).toLocaleString()}.`
        : describe(outcome)
    );
    if (outcome.ok) setPreview(null);
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Session history
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mist-400">
        Everything this browser has produced. Nothing here was uploaded when it
        was created — the benchmark runs below live in this browser and the
        activity log lives in this server&apos;s memory for the length of the
        session. Sending either one anywhere is a separate, deliberate act.
      </p>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
        <div className="border-b border-ink-700 px-6 py-5">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Text and code runs
          </h2>
          <p className="mt-1 text-sm text-mist-400">
            From the dashboard. Nullable figures show as {notReported} rather
            than 0 — &ldquo;never answered&rdquo; and &ldquo;instant&rdquo; are
            not the same result.
          </p>
        </div>

        {benchRuns.length === 0 ? (
          <div className="px-6 py-12 text-center text-mist-400">
            No dashboard runs yet.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="ep-mono bg-ink-950/70 text-[11px] uppercase tracking-wider text-mist-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Model</th>
                    <th className="px-5 py-3 font-medium">Provider</th>
                    <th className="px-5 py-3 font-medium">Iterations</th>
                    <th className="px-5 py-3 font-medium">Success</th>
                    <th className="px-5 py-3 font-medium">Latency</th>
                    <th className="px-5 py-3 font-medium">TTFT</th>
                    <th className="px-5 py-3 font-medium">Tok/s</th>
                    <th className="px-5 py-3 font-medium">Readiness</th>
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-5 py-3 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {benchRuns.map((entry) => {
                    const sum = entry.run.summary;
                    return (
                      <tr
                        key={entry.storedAt}
                        className="transition hover:bg-ink-800/50"
                      >
                        <td className="px-5 py-4 font-semibold text-mist-100">
                          {entry.run.model}
                          {entry.run.simulated ? (
                            <span className="ep-mono ml-2 rounded-md border border-bad-400/40 bg-bad-400/10 px-2 py-0.5 text-[10px] font-semibold text-bad-400">
                              simulated
                            </span>
                          ) : null}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {entry.run.effective_provider ??
                            entry.run.requested_provider}
                          {entry.run.fallback_used ? ' (fallback)' : ''}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {sum.iterations_succeeded}/{sum.iterations_run}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {sum.success_rate_percent.toFixed(0)}%
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {ms(sum.latency_ms_mean)}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {ms(sum.ttft_ms_mean)}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {typeof sum.tokens_per_second_mean === 'number'
                            ? sum.tokens_per_second_mean.toFixed(1)
                            : notReported}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {typeof entry.run.readiness_score === 'number'
                            ? entry.run.readiness_score
                            : notReported}
                        </td>
                        <td className="ep-mono px-5 py-4 text-xs text-mist-500">
                          {new Date(entry.storedAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              saveJson(
                                `edgepilot-benchmark-${entry.run.model.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`,
                                entry.run
                              )
                            }
                          >
                            download
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="btn-row px-6 py-5">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  saveJson(
                    `edgepilot-benchmark-all-${benchRuns.length}-runs.json`,
                    {
                      exported_at: new Date().toISOString(),
                      run_count: benchRuns.length,
                      runs: benchRuns.map((entry) => entry.run),
                    }
                  )
                }
              >
                Download all ({benchRuns.length})
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  clearBenchmarkRuns();
                  setBenchRuns([]);
                }}
              >
                Clear these
              </button>
            </div>
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
        <div className="border-b border-ink-700 px-6 py-5">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Comparisons
          </h2>
          <p className="mt-1 text-sm text-mist-400">
            The most expensive thing here — up to four models times every
            iteration. &ldquo;Established&rdquo; counts only the dimensions
            where the difference sat outside the noise; a comparison with none
            established is a real result, not a failed one.
          </p>
        </div>

        {comparisons.length === 0 ? (
          <div className="px-6 py-12 text-center text-mist-400">
            No comparisons yet.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="ep-mono bg-ink-950/70 text-[11px] uppercase tracking-wider text-mist-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Entrants</th>
                    <th className="px-5 py-3 font-medium">Mode</th>
                    <th className="px-5 py-3 font-medium">Established</th>
                    <th className="px-5 py-3 font-medium">Overall</th>
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-5 py-3 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {comparisons.map((entry) => {
                    const c = entry.comparison;
                    return (
                      <tr
                        key={entry.storedAt}
                        className="transition hover:bg-ink-800/50"
                      >
                        <td className="px-5 py-4 font-semibold text-mist-100">
                          {c.outcomes.map((o) => o.label).join(' vs ')}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {c.plan.mode}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {c.report.overall.established}/
                          {c.report.dimensions.length}
                        </td>
                        <td className="px-5 py-4 text-mist-300">
                          {c.report.overall.winner ?? (
                            <span className="ep-mono text-mist-500">
                              nothing established
                            </span>
                          )}
                        </td>
                        <td className="ep-mono px-5 py-4 text-xs text-mist-500">
                          {new Date(entry.storedAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              saveJson(
                                `edgepilot-comparison-${c.correlation_id}.json`,
                                c
                              )
                            }
                          >
                            download
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="btn-row px-6 py-5">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  saveJson(
                    `edgepilot-comparisons-${comparisons.length}.json`,
                    {
                      exported_at: new Date().toISOString(),
                      comparison_count: comparisons.length,
                      comparisons: comparisons.map((e) => e.comparison),
                    }
                  )
                }
              >
                Download all ({comparisons.length})
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  clearComparisonRuns();
                  setComparisons([]);
                }}
              >
                Clear these
              </button>
            </div>
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
        <div className="border-b border-ink-700 px-6 py-5">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Vision runs
          </h2>
          <p className="mt-1 text-sm text-mist-400">
            Stored in this browser only. Tick the ones you want, or take the
            lot. Downloading never contacts the server.
          </p>
        </div>

        {runs.length === 0 ? (
          <div className="px-6 py-12 text-center text-mist-400">
            No runs yet. Start one on the vision benchmark page.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="ep-mono bg-ink-950/70 text-[11px] uppercase tracking-wider text-mist-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-5 py-3 font-medium">Model</th>
                    <th className="px-5 py-3 font-medium">Dataset</th>
                    <th className="px-5 py-3 font-medium">Accuracy</th>
                    <th className="px-5 py-3 font-medium">Macro F1</th>
                    <th className="px-5 py-3 font-medium">Median</th>
                    <th className="px-5 py-3 font-medium">Gate</th>
                    <th className="px-5 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {runs.map((run) => {
                    const m = run.evidence.metrics;
                    return (
                      <tr
                        key={run.storedAt}
                        className="transition hover:bg-ink-800/50"
                      >
                        <td className="px-5 py-4">
                          <input
                            type="checkbox"
                            checked={selected.has(run.storedAt)}
                            onChange={() => toggle(run.storedAt)}
                            aria-label={`Select the ${run.evidence.model} run`}
                          />
                        </td>
                        <td className="px-5 py-4 font-semibold text-mist-100">
                          {run.evidence.model}
                        </td>
                        <td className="ep-mono px-5 py-4 text-xs text-mist-500">
                          {isShareable(run) ? 'built-in' : 'yours'}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {pct(m.exactMatchAccuracy)}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {m.macroF1.toFixed(3)}
                        </td>
                        <td className="ep-mono px-5 py-4 text-mist-300">
                          {ms(m.medianLatencyMs)}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={
                              run.evidence.passed
                                ? 'rounded-md border border-good-400/40 bg-good-400/10 px-2.5 py-1 text-xs font-semibold text-good-400'
                                : 'rounded-md border border-bad-400/40 bg-bad-400/10 px-2.5 py-1 text-xs font-semibold text-bad-400'
                            }
                          >
                            {run.evidence.passed ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                        <td className="ep-mono px-5 py-4 text-xs text-mist-500">
                          {new Date(run.storedAt).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="btn-row px-6 py-5">
              <button
                type="button"
                className="btn"
                disabled={chosen.length === 0}
                onClick={() => downloadChosen(chosen, 'selected')}
              >
                Download selected ({chosen.length})
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => downloadChosen(runs, 'all')}
              >
                Download all ({runs.length})
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setSelected(
                    selected.size === runs.length
                      ? new Set()
                      : new Set(runs.map((run) => run.storedAt))
                  )
                }
              >
                {selected.size === runs.length ? 'Select none' : 'Select all'}
              </button>
            </div>
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
        <div className="border-b border-ink-700 px-6 py-5">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Activity log
          </h2>
          <p className="mt-1 text-sm text-mist-400">
            What the application did this session — which models were
            benchmarked, what was measured, what verdicts came out. Prompt text
            is never recorded, only its length and a digest.
          </p>
        </div>

        <div className="btn-row px-6 py-5">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              const failure = await downloadSessionLog();
              if (failure) setStatus(describe(failure));
            }}
          >
            Download the log
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={loadPreview}
          >
            Share with the maintainers…
          </button>
        </div>

        {shareable < runs.length ? (
          <p className="px-6 pb-5 text-sm text-mist-400">
            {runs.length - shareable} of your runs used a dataset you supplied.
            Those are download-only: their sample ids are your filenames, their
            labels are your folder names, and the outputs describe your images.
            None of that is ours to receive.
          </p>
        ) : null}

        {preview ? (
          <div className="border-t border-ink-700 px-6 py-5">
            <h3 className="font-display font-semibold text-pulse-300">
              This is exactly what would be sent
            </h3>
            <p className="mt-2 text-sm text-mist-400">
              Not a description of it — the preview and the upload are built by
              the same function, so they cannot drift apart.
            </p>
            <p className="mt-3 rounded-lg border border-ink-600 bg-ink-950 p-4 text-sm text-mist-300">
              {preview.consent_statement}
            </p>
            <ul className="list mt-3">
              {preview.would_send.disclosure.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-ink-600 bg-ink-950 p-4 text-xs text-mist-400">
              {JSON.stringify(preview.would_send, null, 2)}
            </pre>
            <div className="btn-row mt-4">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={confirmShare}
              >
                {busy ? 'Sending…' : `Send ${preview.would_send.event_count} events`}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {status ? (
          <div className="px-6 pb-5">
            <div className="callout" role="status">
              {status}
            </div>
          </div>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
      <DatabaseStatus />
    </div>
  );
}
