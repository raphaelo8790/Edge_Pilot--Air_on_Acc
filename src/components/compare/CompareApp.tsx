"use client";

/**
 * /compare — the UI for POST /api/v1/comparisons.
 *
 * The backend refuses meaningless comparisons (mixed modalities), runs
 * entrants sequentially when more than one shares this machine's GPU, and
 * scores eight dimensions with an honesty code per verdict — including
 * "overlap-indistinguishable", which means the difference is variance, not a
 * ranking. This panel renders those codes distinctly instead of pretending
 * every row has a winner. Nothing here is persisted server-side; the only
 * record is the in-memory session log, surfaced below the results.
 */
import { useEffect, useId, useRef, useState } from "react";

import { ArcadeNavLinks } from "@/components/ArcadeNav";
import { PaletteToggle } from "@/components/PaletteToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

import {
  discardSessionLog,
  downloadSessionLog,
  getLocalRuntime,
  getProviders,
  getSharePreview,
  runComparison,
  shareSessionLog,
  type ApiFailure,
  type ComparisonEntrantInput,
  type ComparisonPlanDto,
  type ComparisonResultDto,
  type LocalModel,
  type ProviderCatalogEntry,
  type SharePreview,
} from "../dashboard/api";
import { fmtElapsed, fmtMs, fmtNum, fmtPct } from "../dashboard/format";
import { ProviderLogo } from "../dashboard/ProviderLogo";
import { ErrorState } from "../dashboard/StateViews";
import {
  describeEgressWarning,
  type EgressWarning,
} from "@/modules/benchmark/core/services/egress-warning";
import type { DimensionVerdict, VerdictCode } from "@/modules/benchmark/core/services/ComparisonReport";
import type { ProviderTier } from "@/modules/benchmark/core/services/PrivacyAssessor";

const DEFAULT_PROMPT =
  "Answer briefly: what is the capital of Japan, and what river runs through Cairo?";

interface EntrantForm {
  provider: string;
  model: string;
  tier: ProviderTier;
}

/** How each verdict code should read — the backend designed these to be
    styled apart, so "too noisy to tell" never looks like "nearly a tie". */
const VERDICT_PRESENTATION: Record<
  VerdictCode,
  { badge: string; label: string }
> = {
  established: { badge: "badge badge-measured", label: "established" },
  identical: { badge: "badge badge-derived", label: "identical" },
  "overlap-close": {
    badge: "badge badge-assumption",
    label: "too close — more iterations may settle it",
  },
  "overlap-indistinguishable": {
    badge: "badge badge-assumption",
    label: "variance, not a difference",
  },
  "insufficient-data": { badge: "badge badge-derived", label: "only one reported" },
  "no-samples": { badge: "badge badge-derived", label: "not comparable" },
  "derived-unproven": {
    badge: "badge badge-derived",
    label: "derived from an unproven difference",
  },
};

export function CompareApp() {
  const id = useId();

  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [entrants, setEntrants] = useState<EntrantForm[]>([
    { provider: "ollama", model: "", tier: "local" },
    { provider: "ollama", model: "", tier: "local" },
  ]);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [iterations, setIterations] = useState(3);

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [refusedPlan, setRefusedPlan] = useState<ComparisonPlanDto | null>(null);
  const [result, setResult] = useState<ComparisonResultDto | null>(null);
  const [pendingWarnings, setPendingWarnings] = useState<EgressWarning[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProviders().then((res) => {
      if (!cancelled && res.ok) setCatalog(res.data);
    });
    getLocalRuntime().then((res) => {
      if (!cancelled) {
        setLocalModels(res.ok && res.data.ok ? res.data.models : []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const promptError =
    prompt.trim().length === 0
      ? "A prompt is required."
      : prompt.length > 4000
        ? "Comparison prompts are limited to 4,000 characters."
        : null;
  const iterError =
    !Number.isInteger(iterations) || iterations < 1 || iterations > 20
      ? "Iterations must be a whole number between 1 and 20."
      : null;
  const entrantError = entrants.some(
    (e) => e.provider.trim() === "" || e.model.trim() === "",
  )
    ? "Every entrant needs a provider and a model."
    : null;

  const setEntrant = (index: number, patch: Partial<EntrantForm>) => {
    setEntrants((all) =>
      all.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    );
  };

  const totalCalls = entrants.length * (iterations + 1);

  /** Same rule as the single-run panel: nothing leaves this machine without
      being confirmed while looking at where it goes. One dialog covers every
      cloud entrant at once — confirming per entrant would be a click drill. */
  const requestRun = () => {
    if (promptError || iterError || entrantError) return;

    const seen = new Set<string>();
    const warnings: EgressWarning[] = [];
    for (const entrant of entrants) {
      if (seen.has(entrant.provider)) continue;
      seen.add(entrant.provider);
      const entry = catalog.find((p) => p.name === entrant.provider) ?? null;
      const warning = describeEgressWarning(
        entry?.base_url ?? null,
        entry?.display_name ?? entrant.provider,
        entry?.type === "local" ? "local" : entrant.tier,
        prompt,
      );
      if (warning.required) warnings.push(warning);
    }

    if (warnings.length > 0) {
      setPendingWarnings(warnings);
      return;
    }
    void run();
  };

  const run = async () => {
    setPendingWarnings(null);
    setRunning(true);
    setFailure(null);
    setRefusedPlan(null);
    setResult(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    const payload: ComparisonEntrantInput[] = entrants.map((e) => ({
      provider: e.provider,
      model: e.model,
      tier: e.tier,
    }));
    const res = await runComparison({ entrants: payload, prompt, iterations });

    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);

    if (res.ok) {
      setResult(res.data);
      return;
    }
    // 422 "Comparison refused" ships the plan inside data so the refusal can
    // be explained per entrant instead of as a bare sentence.
    const refusalData = res.failedRun as unknown as
      | { plan?: ComparisonPlanDto }
      | undefined;
    if (res.status === 422 && refusalData?.plan) {
      setRefusedPlan(refusalData.plan);
    }
    setFailure(res);
  };

  return (
    <div className="epd">
      <header className="epd-header">
        <div className="epd-brand">
          Edge<span>Pilot</span> · Compare
        </div>
        <div className="epd-tagline">
          2–4 models, same prompt, verdict per dimension — with honesty codes
          {" · "}
          <ArcadeNavLinks
            items={[
              { href: "/", label: "home" },
              { href: "/dashboard", label: "dashboard" },
              { href: "/evidence", label: "evidence" },
              { href: "/evaluation", label: "matrix" },
            ]}
          />
        </div>
        <PaletteToggle
          className="btn"
          style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 11 }}
        />
        <ThemeToggle
          className="btn"
          style={{ padding: "4px 10px", fontSize: 12 }}
        />
      </header>

      <main className="epd-main">
        <section className="card" aria-labelledby={`${id}-t`}>
          <h2 id={`${id}-t`}>Head-to-head comparison</h2>
          <p className="card-sub">
            Each entrant runs {iterations + 1} real calls ({iterations} measured
            + 1 discarded cold start). Two local entrants run one after the
            other so they never compete for the GPU — the plan says which mode
            was used and why. Nothing is stored server-side.
          </p>

          {pendingWarnings ? (
            <div
              className="egress-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-egress`}
              onKeyDown={(e) => {
                if (e.key === "Escape") setPendingWarnings(null);
              }}
            >
              <div className="egress-dialog">
                <h3 id={`${id}-egress`} style={{ marginTop: 0 }}>
                  ⚠ This prompt will leave your machine
                </h3>
                {pendingWarnings.map((w) => (
                  <div key={w.title + w.detail} style={{ marginBottom: 10 }}>
                    <p style={{ margin: "0 0 4px" }}>{w.detail}</p>
                    <ul className="list">
                      {w.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>
                  What will be sent, {iterations + 1} times per cloud entrant:
                </p>
                <pre className="egress-prompt">
                  {prompt.length > 1200 ? `${prompt.slice(0, 1200)}…` : prompt}
                </pre>
                <div className="btn-row">
                  <button
                    className="btn"
                    autoFocus
                    onClick={() => setPendingWarnings(null)}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={() => void run()}>
                    Send it anyway
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {running ? (
            <div className="state-panel" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <p className="state-title">
                Comparison running… {fmtElapsed(elapsed)}
              </p>
              <p className="state-detail">
                {totalCalls} real calls across {entrants.length} entrants.
                Sequential mode runs one entrant at a time, so long waits are
                normal — leave this tab open.
              </p>
            </div>
          ) : (
            <>
              <EntrantEditor
                idBase={id}
                entrants={entrants}
                catalog={catalog}
                localModels={localModels}
                onChange={setEntrant}
                onAdd={() =>
                  setEntrants((all) =>
                    all.length >= 4
                      ? all
                      : [...all, { provider: "ollama", model: "", tier: "local" }],
                  )
                }
                onRemove={(index) =>
                  setEntrants((all) =>
                    all.length <= 2 ? all : all.filter((_, i) => i !== index),
                  )
                }
              />
              {entrantError ? <p className="error-text">{entrantError}</p> : null}

              <div className="form-grid" style={{ marginTop: 14 }}>
                <div className="field span-2">
                  <label htmlFor={`${id}-prompt`}>Prompt (sent to every entrant)</label>
                  <textarea
                    id={`${id}-prompt`}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    aria-invalid={promptError ? true : undefined}
                  />
                  <p className="hint">
                    {prompt.length.toLocaleString()} / 4,000 characters
                  </p>
                  {promptError && prompt.length > 0 ? (
                    <p className="error-text">{promptError}</p>
                  ) : null}
                </div>
                <div className="field">
                  <label htmlFor={`${id}-iter`}>Iterations per entrant (1–20)</label>
                  <p className="hint">
                    {totalCalls} calls will be made in total.
                  </p>
                  <input
                    id={`${id}-iter`}
                    type="number"
                    min={1}
                    max={20}
                    value={iterations}
                    onChange={(e) => setIterations(Number(e.target.value))}
                    aria-invalid={iterError ? true : undefined}
                  />
                  {iterError ? <p className="error-text">{iterError}</p> : null}
                </div>
              </div>

              {failure && !refusedPlan ? (
                <ErrorState failure={failure} onRetry={run} />
              ) : null}

              {refusedPlan ? (
                <div className="callout callout-error" role="alert">
                  <strong>Comparison refused.</strong>{" "}
                  {typeof failure?.details === "string" ? failure.details : ""}
                  <ul>
                    {refusedPlan.entrants.map((e) => (
                      <li key={`${e.provider}/${e.model}`}>
                        <strong>
                          {e.provider} / {e.model}
                        </strong>
                        : {e.modality} ({e.modality_confidence}) —{" "}
                        {e.modality_reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  onClick={requestRun}
                  disabled={Boolean(promptError || iterError || entrantError)}
                >
                  Run comparison
                </button>
              </div>
            </>
          )}
        </section>

        {result ? <ComparisonResults result={result} /> : null}
        {result?.session_logged ? <SessionLogPanel /> : null}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EntrantEditor({
  idBase,
  entrants,
  catalog,
  localModels,
  onChange,
  onAdd,
  onRemove,
}: {
  idBase: string;
  entrants: EntrantForm[];
  catalog: ProviderCatalogEntry[];
  localModels: LocalModel[];
  onChange: (index: number, patch: Partial<EntrantForm>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div>
      {entrants.map((entrant, i) => {
        const entry = catalog.find((p) => p.name === entrant.provider) ?? null;
        const isLocal = entry ? entry.type === "local" : entrant.provider === "ollama";
        return (
          <div
            key={i}
            className="form-grid"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: 12,
              marginBottom: 10,
              background: "var(--surface-2)",
            }}
          >
            <div className="field">
              <label htmlFor={`${idBase}-p${i}`}>
                <ProviderLogo
                  provider={entrant.provider}
                  size={15}
                  style={{ marginRight: 6 }}
                />
                Entrant {i + 1} · provider
              </label>
              <select
                id={`${idBase}-p${i}`}
                value={entrant.provider}
                onChange={(e) => {
                  const name = e.target.value;
                  const next = catalog.find((p) => p.name === name);
                  onChange(i, {
                    provider: name,
                    model: "",
                    tier: next?.type === "local" ? "local" : "unknown",
                  });
                }}
              >
                {catalog.length === 0 ? (
                  <option value="ollama">ollama</option>
                ) : (
                  catalog.map((p) => (
                    <option key={p.name} value={p.name} disabled={!p.is_configured}>
                      {p.display_name}
                      {p.is_configured ? "" : " (not configured)"}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${idBase}-m${i}`}>Model</label>
              {isLocal && localModels.length > 0 ? (
                <select
                  id={`${idBase}-m${i}`}
                  value={entrant.model}
                  onChange={(e) => onChange(i, { model: e.target.value })}
                >
                  <option value="">Choose an installed model…</option>
                  {localModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                      {m.parameter_size ? ` · ${m.parameter_size}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${idBase}-m${i}`}
                  value={entrant.model}
                  onChange={(e) => onChange(i, { model: e.target.value })}
                  placeholder="exact model name"
                />
              )}
            </div>
            {!isLocal ? (
              <div className="field">
                <label htmlFor={`${idBase}-t${i}`}>Billing tier (declared)</label>
                <p className="hint">
                  No API reports it, so you declare it. Free tiers commonly
                  permit training on your input — the privacy verdict says so.
                </p>
                <select
                  id={`${idBase}-t${i}`}
                  value={entrant.tier}
                  onChange={(e) =>
                    onChange(i, { tier: e.target.value as ProviderTier })
                  }
                >
                  <option value="unknown">unknown</option>
                  <option value="free">free</option>
                  <option value="paid">paid</option>
                </select>
              </div>
            ) : null}
            {entrants.length > 2 ? (
              <div className="field" style={{ alignSelf: "end" }}>
                <button className="btn" onClick={() => onRemove(i)}>
                  Remove entrant
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      {entrants.length < 4 ? (
        <button className="btn" onClick={onAdd}>
          + Add entrant ({entrants.length}/4)
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function VerdictBadge({ verdict }: { verdict: DimensionVerdict }) {
  const p = VERDICT_PRESENTATION[verdict.code] ?? {
    badge: "badge badge-derived",
    label: verdict.code,
  };
  return <span className={p.badge}>{p.label}</span>;
}

function ComparisonResults({ result }: { result: ComparisonResultDto }) {
  const { plan, report, outcomes } = result;
  const labels = outcomes.map((o) => o.label);

  return (
    <>
      <section className="card">
        <h2>Plan — how this was run</h2>
        <p className="card-sub">
          <span className="badge badge-derived">{plan.mode}</span>{" "}
          {plan.mode_reason}
        </p>
        <ul className="list">
          {plan.entrants.map((e) => (
            <li key={`${e.provider}/${e.model}`}>
              <strong>
                {e.provider} / {e.model}
              </strong>{" "}
              · {e.provider_type} · {e.modality}{" "}
              <span style={{ color: "var(--text-muted)" }}>
                ({e.modality_confidence} — {e.modality_reason})
              </span>
            </li>
          ))}
        </ul>
        {plan.caveats.length > 0 ? (
          <div className="callout callout-warn" role="note">
            <strong>Caveats</strong>
            <ul>
              {plan.caveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Verdicts</h2>
        <p className="card-sub">
          {report.overall.summary} Derived rows are shown for insight but never
          counted in the tally — a measurement is not double-counted through an
          average.
        </p>

        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">Dimension verdicts</caption>
            <thead>
              <tr>
                <th scope="col">Dimension</th>
                {labels.map((l) => (
                  <th scope="col" className="num" key={l}>
                    {l}
                  </th>
                ))}
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {report.dimensions.map((d) => (
                <tr key={d.dimension}>
                  <td>
                    <strong>{d.label}</strong>
                    {d.derived ? (
                      <span className="badge badge-derived" style={{ marginLeft: 6 }}>
                        derived
                      </span>
                    ) : null}
                    <span
                      style={{
                        display: "block",
                        fontSize: 11.5,
                        color: "var(--text-muted)",
                        maxWidth: 260,
                      }}
                    >
                      {d.question} (better: {d.betterIs})
                    </span>
                  </td>
                  {labels.map((l) => {
                    const v = d.values.find((value) => value.label === l);
                    const isWinner = d.established && d.winner === l;
                    return (
                      <td className="num" key={l}>
                        <span style={isWinner ? { fontWeight: 700 } : undefined}>
                          {v && v.value !== null ? fmtNum(v.value, 2) : "—"}
                          {isWinner ? " ◂" : ""}
                        </span>
                      </td>
                    );
                  })}
                  <td>
                    <VerdictBadge verdict={d} />
                    {d.established && d.winner ? (
                      <span style={{ display: "block", fontSize: 12 }}>
                        <strong>{d.winner}</strong>
                        {d.margin ? ` · ${d.margin}` : ""}
                      </span>
                    ) : null}
                    {d.note ? (
                      <span
                        style={{
                          display: "block",
                          fontSize: 11.5,
                          color: "var(--text-muted)",
                          maxWidth: 280,
                        }}
                      >
                        {d.note}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Overall</h3>
        <p className="card-sub">
          {report.overall.winner ? (
            <>
              Winner: <strong>{report.overall.winner}</strong> ·{" "}
            </>
          ) : (
            <>No overall winner · </>
          )}
          {report.overall.established} established measured dimension
          {report.overall.established === 1 ? "" : "s"} · tally:{" "}
          {Object.entries(report.overall.tally)
            .map(([label, wins]) => `${label} ${wins}`)
            .join(" · ") || "empty"}
        </p>

        {report.privacyNotes.length > 0 ? (
          <div className="callout callout-warn" role="note">
            <strong>Privacy</strong>
            <ul>
              {report.privacyNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {report.methodNotes.length > 0 ? (
          <>
            <h3>Method notes</h3>
            <ul className="list">
              {report.methodNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="card">
        <h2>Per-entrant runs</h2>
        <p className="card-sub">
          The full assessment per entrant — including the privacy and hardware
          objects that single benchmark runs do not carry over the wire.
        </p>
        <div className="stat-row" style={{ gridTemplateColumns: "1fr" }}>
          {outcomes.map(({ label, outcome, parametersBillions }) => (
            <div className="stat" key={label}>
              <p className="stat-label">
                <ProviderLogo
                  provider={outcome.requestedProvider}
                  size={15}
                  style={{ marginRight: 6 }}
                />
                {label}
                {parametersBillions !== null ? ` · ${parametersBillions}B params` : ""}{" "}
                {outcome.effectiveProvider === null ? (
                  <span className="badge badge-failed">every attempt failed</span>
                ) : outcome.fallbackUsed ? (
                  <span className="badge badge-assumption">
                    fell back to {outcome.effectiveProvider}
                  </span>
                ) : null}
              </p>
              <p className="stat-sub" style={{ fontSize: 13 }}>
                success {fmtPct(outcome.summary.success_rate_percent)} · mean{" "}
                {fmtMs(outcome.summary.latency_ms_mean)} · TTFT{" "}
                {fmtMs(outcome.summary.ttft_ms_mean)} ·{" "}
                {fmtNum(outcome.summary.tokens_per_second_mean)} tok/s · readiness{" "}
                {outcome.readinessScore !== null
                  ? `${Math.round(outcome.readinessScore)}/100`
                  : "—"}
              </p>
              {outcome.hardware ? (
                <p className="stat-sub">
                  hardware: <strong>{outcome.hardware.state}</strong> —{" "}
                  {outcome.hardware.summary}
                </p>
              ) : null}
              {outcome.privacy ? (
                <p className="stat-sub">
                  privacy: <strong>{outcome.privacy.label}</strong>
                  {outcome.privacy.termsVerified ? "" : " · terms not verified"} —{" "}
                  {outcome.privacy.summary}
                </p>
              ) : null}
              {outcome.effectiveProvider === null ? (
                <ul className="list">
                  {outcome.fallbackChain.map((a, i) => (
                    <li key={i}>
                      {a.provider}: {a.outcome}
                      {a.error_code ? ` (${a.error_code})` : ""} · {a.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

/**
 * The session log exists only because comparisons write to it, and it lives
 * in server memory with a 2-hour idle TTL — export soon or lose it. Share is
 * consent-gated: the preview IS the payload, prompt text always stripped.
 */
function SessionLogPanel() {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<SharePreview | null>(null);

  const exportLog = async () => {
    setBusy(true);
    setFailure(null);
    setNotice(null);
    const err = await downloadSessionLog();
    if (err) setFailure(err);
    else setNotice("Log downloaded.");
    setBusy(false);
  };

  const discard = async () => {
    setBusy(true);
    setFailure(null);
    setNotice(null);
    const res = await discardSessionLog();
    if (res.ok) setNotice("Session log discarded on the server.");
    else setFailure(res);
    setBusy(false);
  };

  const openPreview = async () => {
    setBusy(true);
    setFailure(null);
    setNotice(null);
    const res = await getSharePreview();
    if (res.ok) setPreview(res.data);
    else setFailure(res);
    setBusy(false);
  };

  const confirmShare = async () => {
    setBusy(true);
    setFailure(null);
    const res = await shareSessionLog();
    if (res.ok) {
      setPreview(null);
      setNotice(
        `Shared with the maintainers — ${res.data.event_count} events, id ${res.data.shared_id}.`,
      );
    } else {
      setFailure(res);
    }
    setBusy(false);
  };

  return (
    <section className="card">
      <h2>Session log</h2>
      <p className="card-sub">
        This comparison was recorded in the server&apos;s in-memory session log —
        prompt text stored as a character count and hash, credentials
        redacted, nothing written to disk. It is discarded after 2 idle hours
        or a server restart, so export it if you want to keep it.
      </p>
      <div className="btn-row">
        <button className="btn" onClick={exportLog} disabled={busy}>
          Export log (JSON)
        </button>
        <button className="btn" onClick={openPreview} disabled={busy}>
          Share with maintainers…
        </button>
        <button className="btn" onClick={discard} disabled={busy}>
          Discard log
        </button>
      </div>
      {notice ? (
        <div className="callout callout-ok" role="status">
          {notice}
        </div>
      ) : null}
      {failure ? <ErrorState failure={failure} /> : null}

      {preview ? (
        <div className="callout callout-warn" role="dialog" aria-label="Share consent">
          <strong>Exactly this will be sent — nothing else.</strong>
          <p style={{ margin: "8px 0" }}>{preview.consent_statement}</p>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-muted)" }}>
            {preview.would_send.event_count} events · disclosure:
          </p>
          <ul className="list">
            {preview.would_send.disclosure.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          <pre className="egress-prompt" style={{ marginTop: 8 }}>
            {JSON.stringify(preview.would_send.events.slice(0, 5), null, 2)}
            {preview.would_send.events.length > 5
              ? `\n… ${preview.would_send.events.length - 5} more events (all included in the payload above)`
              : ""}
          </pre>
          <div className="btn-row">
            <button className="btn" onClick={() => setPreview(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmShare} disabled={busy}>
              I consent — share it
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
