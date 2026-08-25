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

export function InstalledModels({ taskType, mode }: Props) {
  const [runtime, setRuntime] = useState<LocalRuntime | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, []);

  if (loading) {
    return (
      <aside className="card" aria-label="Models on this machine">
        <h3 style={{ marginTop: 0 }}>Models on this machine</h3>
        <p className="card-sub">Checking the local runtime…</p>
      </aside>
    );
  }

  if (failure || runtime === null) {
    return (
      <aside className="card" aria-label="Models on this machine">
        <h3 style={{ marginTop: 0 }}>Models on this machine</h3>
        <p className="card-sub">
          Could not reach the local runtime status endpoint.
        </p>
      </aside>
    );
  }

  if (!runtime.ok || runtime.models.length === 0) {
    return (
      <aside className="card" aria-label="Models on this machine">
        <h3 style={{ marginTop: 0 }}>Models on this machine</h3>
        <p className="card-sub">{runtime.message}</p>
        {runtime.remedy ? (
          <div className="callout callout-warn" role="status">
            {runtime.remedy}
          </div>
        ) : null}
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

  return (
    <aside className="card" aria-label="Models on this machine">
      <h3 style={{ marginTop: 0 }}>Models on this machine</h3>
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
        ) : null}
      </p>

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
                    style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}
                  >
                    {model.parameter_size ?? ""}
                    {model.parameter_size && model.size_bytes ? " · " : ""}
                    {sizeLabel(model.size_bytes)}
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
