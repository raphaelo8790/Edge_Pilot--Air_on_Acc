"use client";

/**
 * Every model on the machine, always visible.
 *
 * It exists because the model field used to be a free-text box with a
 * hardcoded suggestion list - llama3.2:1b, llama3.1:8b - that had nothing to
 * do with what was actually installed. Typing a name the runtime does not
 * have fails the whole run with `invalid_model` after the request has already
 * gone out. Showing what is really there removes the guess.
 *
 * The classes come from the families the runtime reports, via
 * classifyModality. Vision and embedding are identified; text is the residual,
 * which is why a model's row carries its confidence rather than presenting the
 * class as certain.
 *
 * When a task type is chosen, models that CANNOT do it are greyed with the
 * reason attached - not hidden. Hiding them would leave a user wondering where
 * their model went; greying answers the question in place.
 */
import { useEffect, useState } from "react";

import {
  checkTaskFit,
  requirementFor,
  type TaskType,
} from "@/modules/benchmark/core/services/TaskCompatibility";
import { getLocalRuntime, type ApiFailure, type LocalModel, type LocalRuntime } from "./api";
import { OllamaMark } from "./ProviderLogo";
import { ErrorState } from "./StateViews";

const CLASS_LABEL: Record<LocalModel["modality"], string> = {
  text: "Text generation",
  vision: "Vision",
  embedding: "Embeddings",
};

const CLASS_ORDER: Array<LocalModel["modality"]> = ["text", "vision", "embedding"];

function sizeLabel(bytes: number | null): string {
  if (bytes === null) return "";
  const gb = bytes / 1_000_000_000;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
}

/** Shared with ProviderPanel so both apply the same rule to the same data. */
export function fitFor(model: LocalModel, taskType: TaskType | null) {
  if (taskType === null) {
    return { usable: true, reason: "" };
  }

  return checkTaskFit(taskType, {
    modality: model.modality,
    confidence: model.modality_confidence,
    reason: model.modality_reason,
  });
}

/**
 * "grey" keeps every model on screen and dims the ones the chosen class rules
 * out, with the reason. "usable-only" lists just the ones that can run and
 * says how many were left out. The first is for deciding, the second is for
 * choosing.
 */
export type PanelMode = "grey" | "usable-only";

interface Props {
  /** Null only if no class has been chosen at all. */
  taskType: TaskType | null;
  mode: PanelMode;
}

/**
 * Shown when the runtime is up AND at least one model is held in memory.
 *
 * It is a status signal, not decoration for its own sake: something is
 * loaded and ready to answer without paying a cold start first. The caller
 * owns the condition — see the note at the call site for why it is not
 * simply "the runtime is up".
 *
 * The neck is its own group so it can rotate about the shoulder while the
 * body stays put; two transform animations on one element would not compose.
 * Drawn for this project — plain geometry, no traced artwork.
 */
function GrazingLlama() {
  return (
    <div className="llama-scene" aria-hidden="true" title="Ollama is up and idle">
      <svg viewBox="0 0 92 52" width="92" height="52">
        {/* grass it is working on */}
        <g
          className="llama-grass"
          fill="none"
          stroke="var(--status-good)"
          strokeWidth="2.6"
          strokeLinecap="round"
        >
          <path d="M62 46c-1-7-2-12-3-17" />
          <path d="M69 46c0-8 0-13 1-19" />
          <path d="M76 46c1-7 3-12 5-16" />
        </g>

        {/* ground line */}
        <path
          d="M4 46.5h84"
          stroke="var(--border-strong)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* legs */}
        <g fill="#b08b57">
          <rect x="20" y="32" width="4.4" height="14" rx="2.2" />
          <rect x="28" y="32" width="4.4" height="14" rx="2.2" />
          <rect x="40" y="32" width="4.4" height="14" rx="2.2" />
          <rect x="47" y="32" width="4.4" height="14" rx="2.2" />
        </g>

        {/* tail */}
        <path
          d="M17 26c-4-1-6 1-5 4"
          stroke="#c49a63"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />

        {/* body */}
        <ellipse cx="34" cy="28" rx="17" ry="9.5" fill="#d8b27c" />
        <ellipse cx="30" cy="25.5" rx="11" ry="5.5" fill="#e8cb9c" />

        {/* neck and head, rotating about the shoulder */}
        <g className="llama-neck">
          <rect x="43.5" y="9" width="7.5" height="22" rx="3.7" fill="#d8b27c" />
          <ellipse cx="47" cy="9" rx="7.6" ry="6.2" fill="#e8cb9c" />
          {/* ears */}
          <path d="M43 4.6l1.6-4.2 2.2 3.6z" fill="#c49a63" />
          <path d="M50 4.4l2.4-3.6 1.2 4.2z" fill="#c49a63" />
          {/* snout and eye */}
          <ellipse cx="51.5" cy="11.6" rx="4" ry="3.2" fill="#f2ddb8" />
          <circle cx="52.8" cy="11.2" r="0.9" fill="#5b4326" />
          <circle cx="45.6" cy="8.2" r="1.2" fill="#5b4326" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Shown beside a model Ollama has unloaded: the llama has gone to bed.
 *
 * Inline and tiny, so it is drawn as a silhouette rather than a scene — at
 * this size an accurate bed frame is mud. Only rendered for a definite
 * `resident === false`; null means the runtime could not be asked.
 */
function SleepingLlama() {
  return (
    <span
      className="llama-bed"
      title="Asleep — not loaded, so the next call pays a cold start"
      aria-hidden="true"
    >
      <svg viewBox="0 0 38 24" width="34" height="22">
        {/* headboard and frame */}
        <rect x="1" y="6" width="4" height="16" rx="1.6" fill="#8a6a3f" />
        <rect x="1" y="19" width="35" height="3.4" rx="1.7" fill="#8a6a3f" />
        {/* pillow */}
        <rect x="5.5" y="12" width="9" height="6" rx="2.6" fill="#f2ddb8" />
        {/* blanket */}
        <path d="M14 19v-4.6a2.6 2.6 0 0 1 2.6-2.6H34a2 2 0 0 1 2 2V19z" fill="#c07c3c" />
        <path d="M14 15.4h22" stroke="#a4632a" strokeWidth="1.2" />
        {/* the llama, head on the pillow */}
        <ellipse cx="12.4" cy="12.6" rx="5" ry="4.2" fill="#e8cb9c" />
        <path d="M9.6 8.8l1-3 1.5 2.4z" fill="#c49a63" />
        <path d="M14 8.7l1.7-2.5.8 2.9z" fill="#c49a63" />
        {/* closed eye and muzzle */}
        <path
          d="M10.4 12.2q1.2 1 2.4 0"
          fill="none"
          stroke="#5b4326"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <ellipse cx="15.4" cy="13.6" rx="2.4" ry="1.8" fill="#f2ddb8" />
        {/* one drifting z */}
        <text className="llama-bed-z" x="22" y="9" fontSize="8" fontWeight="700" fill="var(--accent)">
          z
        </text>
      </svg>
    </span>
  );
}

/**
 * Shown when the runtime cannot be found at all: the llama is lost, and has
 * a map out.
 *
 * Deliberately NOT shown for "reachable-no-models" — Ollama is running fine
 * there, it just has nothing pulled, and a lost llama would send the reader
 * looking for a connection problem that does not exist.
 */
function LostLlama() {
  return (
    <div className="llama-lost" aria-hidden="true" title="Ollama could not be found on this machine">
      <svg viewBox="0 0 96 56" width="96" height="56">
        {/* ground */}
        <path
          d="M4 50.5h88"
          stroke="var(--border-strong)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* legs */}
        <g fill="#b08b57">
          <rect x="24" y="36" width="4.4" height="14" rx="2.2" />
          <rect x="32" y="36" width="4.4" height="14" rx="2.2" />
          <rect x="44" y="36" width="4.4" height="14" rx="2.2" />
          <rect x="51" y="36" width="4.4" height="14" rx="2.2" />
        </g>

        {/* body */}
        <ellipse cx="38" cy="32" rx="17" ry="9.5" fill="#d8b27c" />
        <ellipse cx="34" cy="29.5" rx="11" ry="5.5" fill="#e8cb9c" />

        {/* the map, held up in front */}
        <g className="llama-map">
          <rect x="52" y="20" width="26" height="18" rx="1.6" fill="#f6efdc" stroke="#c2ab84" strokeWidth="1.2" />
          <path d="M60.5 20v18M69 20v18" stroke="#c2ab84" strokeWidth="1" />
          <path
            d="M56 33c3-4 6-2 8-6s5-3 8-5"
            fill="none"
            stroke="#c0392b"
            strokeWidth="1.4"
            strokeDasharray="2 2"
            strokeLinecap="round"
          />
          <circle cx="73" cy="22.6" r="1.6" fill="#c0392b" />
        </g>

        {/* neck and head, turning as it searches */}
        <g className="llama-lost-neck">
          <rect x="46.5" y="12" width="7.5" height="22" rx="3.7" fill="#d8b27c" />
          <ellipse cx="50" cy="12" rx="7.6" ry="6.2" fill="#e8cb9c" />
          <path d="M46 7.6l1.6-4.2 2.2 3.6z" fill="#c49a63" />
          <path d="M53 7.4l2.4-3.6 1.2 4.2z" fill="#c49a63" />
          <ellipse cx="54.5" cy="14.6" rx="4" ry="3.2" fill="#f2ddb8" />
          <circle cx="55.8" cy="14.2" r="0.9" fill="#5b4326" />
          <circle cx="48.6" cy="11.2" r="1.2" fill="#5b4326" />
        </g>

        {/* "where am I" */}
        <text
          className="llama-question"
          x="24"
          y="16"
          fontSize="15"
          fontWeight="700"
          fill="var(--status-warn)"
        >
          ?
        </text>
      </svg>
    </div>
  );
}

/** The five wire states, each with its own severity — a wrong OLLAMA_HOST is
    a config mistake, not a stopped daemon, and should not read the same. */
const STATE_LABEL: Record<LocalRuntime["state"], string> = {
  ready: "ready",
  "reachable-no-models": "reachable · no models",
  unreachable: "unreachable",
  "bad-host": "bad host",
  "not-configured": "not configured",
};

export function InstalledModels({ taskType, mode }: Props) {
  const [runtime, setRuntime] = useState<LocalRuntime | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getLocalRuntime().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setRuntime(res.data);
        setFailure(null);
      } else {
        setFailure(res);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /** Re-check after `ollama pull` or after starting the daemon. */
  const refresh = () => {
    setLoading(true);
    setFailure(null);
    setReloadKey((k) => k + 1);
  };

  if (loading) {
    return (
      <aside className="card" aria-label="Models on this machine">
        <h3 style={{ marginTop: 0 }}>
          <OllamaMark size={16} style={{ marginRight: 6 }} />
          Models on this machine
        </h3>
        <p className="card-sub">Checking the local runtime…</p>
      </aside>
    );
  }

  if (failure || runtime === null) {
    return (
      <aside className="card" aria-label="Models on this machine">
        <h3 style={{ marginTop: 0 }}>
          <OllamaMark size={16} style={{ marginRight: 6 }} />
          Models on this machine
        </h3>
        <ErrorState
          failure={
            failure ?? {
              ok: false,
              status: 0,
              error: "Local runtime status unavailable",
            }
          }
          onRetry={refresh}
        />
      </aside>
    );
  }

  if (!runtime.ok || runtime.models.length === 0) {
    // Config mistakes (bad-host / not-configured) are the caller's to fix and
    // render as errors; a stopped daemon or empty install is a warn.
    const configProblem =
      runtime.state === "bad-host" || runtime.state === "not-configured";
    // "Not found" is the three states where nothing answered or nowhere was
    // asked. `reachable-no-models` is excluded on purpose: Ollama is running
    // perfectly there, it just has nothing pulled, and a lost llama would
    // send the reader hunting a connection problem that does not exist.
    const notFound =
      runtime.state === "unreachable" ||
      runtime.state === "not-configured" ||
      runtime.state === "bad-host";
    return (
      <aside className="card" aria-label="Models on this machine">
        <h3 style={{ marginTop: 0 }}>
          <OllamaMark size={16} style={{ marginRight: 6 }} />
          Models on this machine{" "}
          <span className={`badge ${configProblem ? "badge-failed" : "badge-assumption"}`}>
            {STATE_LABEL[runtime.state]}
          </span>
        </h3>
        <p className="card-sub">{runtime.message}</p>
        {notFound ? <LostLlama /> : null}
        {runtime.remedy ? (
          <div
            className={`callout ${configProblem ? "callout-error" : "callout-warn"}`}
            role="status"
          >
            {runtime.remedy}
          </div>
        ) : null}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={refresh}>
            Check again
          </button>
        </div>
      </aside>
    );
  }

  const requirement = taskType === null ? null : requirementFor(taskType);
  const hideUnusable = mode === "usable-only";
  const visible = hideUnusable
    ? runtime.models.filter((m) => fitFor(m, taskType).usable)
    : runtime.models;

  const groups = CLASS_ORDER.map((modality) => ({
    modality,
    models: visible.filter((m) => m.modality === modality),
  })).filter((g) => g.models.length > 0);

  const unusable = runtime.models.filter((m) => !fitFor(m, taskType).usable).length;

  // Residency drives which llama is shown. `null` is neither loaded nor
  // asleep — it means /api/ps could not be read — so it is counted as
  // neither, and only a definite answer moves the needle either way.
  const anyLoaded = runtime.models.some((m) => m.resident === true);
  const anyAsleep = runtime.models.some((m) => m.resident === false);
  const residencyKnown = anyLoaded || anyAsleep;
  const grazing = anyLoaded || !residencyKnown;

  return (
    <aside className="card" aria-label="Models on this machine">
      <h3 style={{ marginTop: 0 }}>
          <OllamaMark size={16} style={{ marginRight: 6 }} />
          Models on this machine
        </h3>
      <p className="card-sub">
        {hideUnusable ? (
          <>
            {visible.length} of {runtime.model_count} can run this workload
          </>
        ) : (
          <>
            {runtime.model_count} installed on <code>{runtime.host}</code>
            {runtime.version ? ` · Ollama ${runtime.version}` : ""}
          </>
        )}
        {requirement !== null && unusable > 0 ? (
          <>
            {" "}
            · {unusable}{" "}
            {hideUnusable ? "hidden" : "greyed out"} because this workload needs{" "}
            {requirement.needs}
          </>
        ) : null}{" "}
        ·{" "}
        <button
          type="button"
          onClick={refresh}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            color: "var(--accent)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          refresh
        </button>
      </p>

      {/*
        The two llamas divide the work so they can never contradict each
        other: this one means "at least one model is in memory right now",
        and a bed beside a model means "that one is not".

        Without the residency condition both appeared at once — a llama
        happily grazing directly above the only model, asleep — which read as
        a contradiction rather than as two facts.

        The `!residencyKnown` arm keeps the ready signal when /api/ps could
        not be read at all: nothing is claimed to be loaded, but neither is
        anything claimed to be asleep, and the runtime really is up.
      */}
      {grazing ? <GrazingLlama /> : null}

      {hideUnusable && visible.length === 0 ? (
        <div className="callout callout-warn" role="status">
          <strong>Nothing installed can run this workload.</strong> Pull a model
          that can, or go back to step 1 and change the task type.
        </div>
      ) : null}

      {/*
        Only from step 2 onward. Step 1 states this next to the class picker,
        and showing it in both places at once just reads as a stutter.
      */}
      {hideUnusable && requirement?.suitabilityUnverifiable ? (
        <div className="callout" role="note" style={{ fontSize: 12 }}>
          {requirement.caveat}
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.modality} style={{ marginTop: 12 }}>
          <p
            style={{
              margin: "0 0 4px",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-muted)",
            }}
          >
            {CLASS_LABEL[group.modality]} · {group.models.length}
          </p>
          <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {group.models.map((model) => {
              const fit = fitFor(model, taskType);

              return (
                <li
                  key={model.name}
                  title={fit.usable ? model.modality_reason : fit.reason}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "3px 0",
                    opacity: fit.usable ? 1 : 0.45,
                  }}
                >
                  <span>
                    <code>{model.name}</code>
                    {/*
                      Asleep: installed but not held in memory, so the next
                      call pays to read it off disk. Only rendered for a
                      definite `false` — `null` means /api/ps could not be
                      read, and putting the llama to bed then would be
                      inventing the answer. CSS shows it in the arcade
                      palette only.
                    */}
                    {model.resident === false ? <SleepingLlama /> : null}
                    {model.modality_confidence === "inferred" ? (
                      <span
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                        title={model.modality_reason}
                      >
                        {" "}
                        (inferred)
                      </span>
                    ) : null}
                    {!fit.usable ? (
                      <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>
                        {fit.reason}
                      </span>
                    ) : null}
                  </span>
                  <span
                    style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", textAlign: "right" }}
                  >
                    {model.parameter_size ?? ""}
                    {model.parameter_size && model.size_bytes ? " · " : ""}
                    {sizeLabel(model.size_bytes)}
                    {/* quantization + families come straight off /api/tags —
                        Q4 vs Q8 of the same model benchmark differently, so
                        the label belongs next to the size it explains. */}
                    {model.quantization || model.families.length > 0 ? (
                      <span style={{ display: "block", fontSize: 11 }}>
                        {model.quantization ?? ""}
                        {model.quantization && model.families.length > 0 ? " · " : ""}
                        {model.families.join(", ")}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
