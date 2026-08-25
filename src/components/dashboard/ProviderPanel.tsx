"use client";

/**
 * Step 2 — provider catalog & model choice, from GET /api/v1/providers
 * (benchmark module). The endpoint answers even without a database; the
 * panel surfaces meta.database_available, configuration warnings and each
 * provider's is_configured/configuration_hint honestly instead of hiding
 * unusable options.
 */
import { useEffect, useId, useState } from "react";

import {
  getProviders,
  type ApiFailure,
  type ProviderCatalogEntry,
  type ProvidersMeta,
} from "./api";
import { ErrorState, LoadingState, EmptyState } from "./StateViews";

export const PROVIDER_COLOR: Record<string, string> = {
  ollama: "var(--series-ollama)",
  gemini: "var(--series-gemini)",
  groq: "var(--series-groq)",
};

/** Suggested model names per provider (from the providers' official docs). */
const MODEL_SUGGESTIONS: Record<string, string[]> = {
  ollama: ["llama3.2:1b", "llama3.2:3b", "llama3.1:8b"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro"],
  groq: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"],
};

interface Props {
  selectedProvider: string | null;
  model: string;
  onSelect: (provider: string) => void;
  onModel: (model: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function ProviderPanel({
  selectedProvider,
  model,
  onSelect,
  onModel,
  onContinue,
  onBack,
}: Props) {
  const id = useId();
  const [providers, setProviders] = useState<ProviderCatalogEntry[] | null>(null);
  const [meta, setMeta] = useState<ProvidersMeta | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const [reloadKey, setReloadKey] = useState(0);

  // State updates happen only after the response arrives (never synchronously
  // inside the effect body — react-hooks/set-state-in-effect), and a cancelled
  // flag drops responses that land after unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getProviders();
      if (cancelled) return;
      if (res.ok) {
        setProviders(res.data);
        setMeta((res.meta as ProvidersMeta) ?? null);
      } else {
        setFailure(res);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /** Retry from the error/empty states (event handler — sync sets are fine). */
  const load = () => {
    setLoading(true);
    setFailure(null);
    setReloadKey((k) => k + 1);
  };

  const selected = providers?.find((p) => p.name === selectedProvider) ?? null;
  const ready = selected !== null && model.trim().length > 0;

  return (
    <section className="card" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>2 · Provider & model</h2>
      <p className="card-sub">
        The catalog below is live from the server: which providers exist,
        which are actually configured here, and where their measurements come
        from.
      </p>

      {loading ? (
        <LoadingState label="Loading the provider catalog…" />
      ) : failure ? (
        <ErrorState failure={failure} onRetry={load} />
      ) : !providers || providers.length === 0 ? (
        <EmptyState
          title="No providers in the catalog"
          detail="The registry answered with an empty list — run `npm run db:seed` on the server, then reload."
          onAction={load}
        />
      ) : (
        <>
          {meta && !meta.database_available ? (
            <div className="callout callout-warn" role="status">
              <strong>Database unreachable.</strong>{" "}
              {meta.message ??
                "Provider ids are null; benchmark runs cannot be persisted until the database is back."}
            </div>
          ) : null}
          {meta && meta.configuration_warnings.length > 0 ? (
            <div className="callout callout-warn" role="status">
              <strong>Server configuration warnings</strong>
              <ul>
                {meta.configuration_warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="radio-cards" role="radiogroup" aria-label="Providers">
            {providers.map((p) => (
              <label
                key={p.name}
                className={`radio-card${p.is_configured ? "" : " disabled"}`}
              >
                <input
                  type="radio"
                  name={`${id}-prov`}
                  checked={selectedProvider === p.name}
                  disabled={!p.is_configured}
                  onChange={() => {
                    onSelect(p.name);
                    if (!model.trim()) {
                      onModel(MODEL_SUGGESTIONS[p.name]?.[0] ?? "");
                    }
                  }}
                />
                <span className="rc-title">
                  <span
                    className="swatch"
                    style={{ background: PROVIDER_COLOR[p.name] ?? "var(--text-muted)" }}
                    aria-hidden="true"
                  />
                  {p.display_name}
                </span>
                <span className="rc-meta">
                  {p.type} · privacy: {p.privacy_level} ·{" "}
                  {p.reports_ttft ? "reports TTFT" : "no TTFT"} ·{" "}
                  {p.reports_output_tokens ? "reports tokens" : "no token counts"}
                </span>
                <span className="rc-meta">
                  {p.is_configured ? (
                    <span className="badge badge-measured">configured</span>
                  ) : (
                    <span className="badge badge-failed" title={p.configuration_hint ?? ""}>
                      not configured
                    </span>
                  )}{" "}
                  {!p.in_catalog || p.provider_id === null ? (
                    <span className="badge badge-assumption">not in database</span>
                  ) : null}
                </span>
                {!p.is_configured && p.configuration_hint ? (
                  <span className="rc-meta" style={{ fontStyle: "italic" }}>
                    {p.configuration_hint}
                  </span>
                ) : null}
                <span className="rc-meta">
                  <a href={p.official_source} target="_blank" rel="noreferrer">
                    Official documentation
                  </a>
                </span>
              </label>
            ))}
          </div>

          <div className="field" style={{ marginTop: 16, maxWidth: 420 }}>
            <label htmlFor={`${id}-model`}>Model</label>
            <p className="hint">
              Exact model name as the provider knows it (an unknown name fails
              the run with <code>invalid_model</code>).
            </p>
            <input
              id={`${id}-model`}
              list={`${id}-models`}
              value={model}
              onChange={(e) => onModel(e.target.value)}
              placeholder="e.g. llama3.2:1b"
            />
            <datalist id={`${id}-models`}>
              {(selectedProvider ? MODEL_SUGGESTIONS[selectedProvider] ?? [] : []).map(
                (m) => (
                  <option key={m} value={m} />
                ),
              )}
            </datalist>
          </div>

          <div className="btn-row">
            <button className="btn" onClick={onBack}>
              ← Back
            </button>
            <button className="btn btn-primary" disabled={!ready} onClick={onContinue}>
              Continue to run →
            </button>
          </div>
        </>
      )}
    </section>
  );
}
