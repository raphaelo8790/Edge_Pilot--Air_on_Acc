"use client";

/**
 * Step 4 — the structured results dashboard for one BenchmarkRun.
 *
 * Renders exactly what the measurement envelope guarantees, and nothing it
 * does not: nullable aggregates say "not measured" (never 0), every figure
 * carries its provenance badge (measured / derived / unavailable /
 * simulated), the fallback chain is shown when used, and the readiness
 * score arrives with its evidence, assumptions and limitations attached
 * (project rule: unmeasured claims must be marked as assumptions).
 */
import { useEffect, useId, useState } from "react";

import type {
  FallbackAttempt,
  MeasuredIteration,
} from "@/modules/benchmark/application/dtos/BenchmarkMeasurement";
import {
  getReadiness,
  type ApiFailure,
  type BenchmarkRun,
  type ReadinessRecord,
} from "./api";
import { describeErrorCode, fmtMs, fmtNum, fmtPct, isUuid } from "./format";
import { PROVIDER_COLOR } from "./ProviderPanel";
import { ErrorState, LoadingState } from "./StateViews";

function ProvenanceBadge({ status }: { status: string }) {
  const cls =
    status === "measured"
      ? "badge badge-measured"
      : status === "derived"
        ? "badge badge-derived"
        : status === "simulated"
          ? "badge badge-simulated"
          : "badge badge-assumption";
  const label = status === "unavailable" ? "not reported" : status;
  return <span className={cls}>{label}</span>;
}

function FallbackChain({ chain }: { chain: FallbackAttempt[] }) {
  return (
    <div className="callout callout-warn" role="status">
      <strong>Fallback chain</strong> — the requested provider did not answer
      first; every attempt is listed:
      <ul>
        {chain.map((a, i) => (
          <li key={i}>
            <strong>{a.provider}</strong>: {a.outcome}
            {a.error_code ? ` (${a.error_code} — ${describeErrorCode(a.error_code)})` : ""}
            {a.detail ? ` · ${a.detail}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IterationsTable({ rows }: { rows: MeasuredIteration[] }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Per-iteration measurements</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Provider</th>
            <th scope="col" className="num">Latency</th>
            <th scope="col" className="num">TTFT</th>
            <th scope="col" className="num">Tokens/s</th>
            <th scope="col" className="num">Out tokens</th>
            <th scope="col">Outcome</th>
            <th scope="col">Provenance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.provider}-${r.iteration}`}>
              <td className="num">{r.iteration}</td>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span
                    className="swatch"
                    style={{ background: PROVIDER_COLOR[r.provider] ?? "var(--text-muted)" }}
                    aria-hidden="true"
                  />
                  {r.provider} · {r.model}
                </span>
              </td>
              <td className="num">{fmtMs(r.latency_ms)}</td>
              <td className="num">{fmtMs(r.ttft_ms)}</td>
              <td className="num">{fmtNum(r.tokens_per_second)}</td>
              <td className="num">{r.output_tokens ?? "—"}</td>
              <td>
                {r.success ? (
                  <span className="badge badge-measured">✓ ok</span>
                ) : (
                  <span
                    className="badge badge-failed"
                    title={r.error_message ?? describeErrorCode(r.error_code)}
                  >
                    ✕ {r.error_code ?? "failed"}
                  </span>
                )}
              </td>
              <td>
                <ProvenanceBadge status={r.provenance.latency_ms} />{" "}
                {r.tokens_per_second !== null ? (
                  <ProvenanceBadge status={r.provenance.tokens_per_second} />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadinessBars({ readiness }: { readiness: ReadinessRecord }) {
  const rows: Array<{ label: string; value: number }> = [
    { label: "Hardware fit", value: readiness.hardwareFit },
    { label: "Latency", value: readiness.latencyScore },
    { label: "Privacy", value: readiness.privacyScore },
    { label: "Cost", value: readiness.costScore },
    { label: "Reliability", value: readiness.reliabilityScore },
  ];
  return (
    <div>
      {rows.map((r) => (
        <div
          className="bar-row"
          key={r.label}
          aria-label={`${r.label}: ${r.value} out of 100`}
        >
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(2, Math.min(100, r.value))}%` }}
            />
          </span>
          <span className="bar-value">{Math.round(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  run: BenchmarkRun;
  onRunAnother: () => void;
  onStartOver: () => void;
}

export function RunResults({ run, onRunAnother, onStartOver }: Props) {
  const id = useId();
  const [readiness, setReadiness] = useState<ReadinessRecord | null>(null);
  const [readinessFailure, setReadinessFailure] = useState<ApiFailure | null>(null);
  const persistedId = isUuid(run.benchmark_id) ? run.benchmark_id : null;

  // Loading starts true only when there is a persisted id to fetch; state is
  // then updated exclusively after the response arrives (never synchronously
  // in the effect body — react-hooks/set-state-in-effect).
  const [readinessLoading, setReadinessLoading] = useState<boolean>(
    () => persistedId !== null,
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!persistedId) return;
    let cancelled = false;
    (async () => {
      const res = await getReadiness(persistedId);
      if (cancelled) return;
      if (res.ok) setReadiness(res.data);
      else setReadinessFailure(res);
      setReadinessLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [persistedId, retryKey]);

  /** Retry from the error state (event handler — sync sets are fine). */
  const retryReadiness = () => {
    setReadinessLoading(true);
    setReadinessFailure(null);
    setRetryKey((k) => k + 1);
  };

  const s = run.summary;
  const failed = run.status === "failed";

  return (
    <section className="card" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>4 · Results{failed ? " — run failed" : ""}</h2>
      <p className="card-sub">
        {run.requested_provider}
        {run.fallback_used && run.effective_provider
          ? ` → ${run.effective_provider} (fallback)`
          : ""}{" "}
        · {run.model} · benchmark id <code>{run.benchmark_id}</code>
      </p>

      {failed ? (
        <div className="callout callout-error" role="alert">
          <strong>Every provider in the chain failed.</strong> Nothing below is
          a working measurement, but how each attempt failed is evidence — the
          chain and per-iteration errors are preserved for diagnosis.
        </div>
      ) : null}
      {run.simulated ? (
        <div className="callout callout-warn" role="status">
          <strong>Simulated figures present.</strong> At least one number came
          from the demo adapter, not a real provider — this run must not be
          used as deployment evidence.
        </div>
      ) : null}
      {!run.persisted ? (
        <div className="callout callout-warn" role="status">
          <strong>Not persisted.</strong> The run measured successfully but
          could not be written to the database; it exists only in this page
          (export it below before leaving).
        </div>
      ) : null}
      {run.fallback_used ? <FallbackChain chain={run.fallback_chain} /> : null}

      <div className="stat-row">
        <div className="stat">
          <p className="stat-label">Success rate</p>
          <p className="stat-value">{fmtPct(s.success_rate_percent)}</p>
          <p className="stat-sub">
            {s.iterations_succeeded}/{s.iterations_run} iterations
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Mean latency</p>
          <p className="stat-value">{fmtMs(s.latency_ms_mean)}</p>
          <p className="stat-sub">
            min {fmtMs(s.latency_ms_min)} · max {fmtMs(s.latency_ms_max)}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">p50 latency</p>
          <p className="stat-value">{fmtMs(s.latency_ms_p50)}</p>
          <p className="stat-sub">withheld below 3 successes</p>
        </div>
        <div className="stat">
          <p className="stat-label">Tokens / second</p>
          <p className="stat-value">{fmtNum(s.tokens_per_second_mean)}</p>
          <p className="stat-sub">
            TTFT mean {fmtMs(s.ttft_ms_mean)}
          </p>
        </div>
      </div>

      <h3>Per-iteration evidence</h3>
      <IterationsTable rows={run.results} />

      <h3>Readiness</h3>
      {run.readiness_score === null ? (
        <p className="card-sub">
          No readiness score — nothing was successfully measured in this run.
        </p>
      ) : (
        <p className="card-sub">
          Overall readiness{" "}
          <strong style={{ fontSize: 18 }}>{Math.round(run.readiness_score)}/100</strong>{" "}
          — {run.recommendation}
        </p>
      )}
      {persistedId ? (
        readinessLoading ? (
          <LoadingState label="Loading the recorded readiness breakdown…" />
        ) : readinessFailure ? (
          readinessFailure.status === 404 ? (
            <p className="card-sub">
              No stored readiness breakdown for this run.
            </p>
          ) : (
            <ErrorState failure={readinessFailure} onRetry={retryReadiness} />
          )
        ) : readiness ? (
          <ReadinessBars readiness={readiness} />
        ) : null
      ) : (
        <p className="card-sub">
          Breakdown unavailable — the run was not persisted, so there is no
          stored readiness row to fetch.
        </p>
      )}

      {run.evidence.length > 0 ? (
        <>
          <h3>Evidence (observed)</h3>
          <ul className="list">
            {run.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </>
      ) : null}

      {run.assumptions.length > 0 ? (
        <div className="callout callout-warn">
          <strong>⚠ Assumptions (unmeasured claims)</strong>
          <ul>
            {run.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {run.limitations.length > 0 ? (
        <>
          <h3>Limitations</h3>
          <ul className="list">
            {run.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="btn-row">
        <button
          className="btn btn-primary"
          onClick={() =>
            downloadJson(`edgepilot-run-${run.benchmark_id}.json`, run)
          }
        >
          Export run (JSON)
        </button>
        <button className="btn" onClick={onRunAnother}>
          Run another benchmark
        </button>
        <button className="btn" onClick={onStartOver}>
          Start over
        </button>
      </div>
    </section>
  );
}
