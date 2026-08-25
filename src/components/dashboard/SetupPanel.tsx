"use client";

/**
 * Step 1 — describe the workload.
 *
 * POST /api/v1/workloads writes a real row and returns a real database uuid.
 * That id is held in state here and handed to the next step; it is never
 * rendered, and there is no field to type one into.
 *
 * THIS PANEL USED TO ASK THE USER FOR A UUID. When the endpoint was still a
 * scaffold that echoed placeholder ids, the panel said so and offered a box to
 * paste an existing row's uuid into, because POST /api/v1/benchmarks 404s on
 * unknown rows. That was the honest thing to do at the time and the wrong
 * thing to keep: a uuid is the database's business, not the user's.
 *
 * IT ALSO USED TO ASK FOR THE MACHINE'S SPECIFICATIONS — name, CPU, RAM, GPU,
 * storage — and wrote them to a `devices` row. Nothing ever read them back.
 * RunBenchmark loaded that row only to check who owned it, and hardware fit is
 * measured from what the runtime reports about actual GPU residency, not from
 * anything typed here. Six required fields that changed no output. They are
 * gone, along with the table behind them.
 *
 * The id is still validated before Continue unlocks — see `workloadSaved`. If
 * the endpoint ever regresses to echoing a placeholder, this reports it as a
 * failure instead of letting a bad id through to a confusing 404 later.
 */
import { useId, useState } from "react";

import {
  createWorkload,
  type ApiFailure,
  type CreateWorkloadInput,
} from "./api";
import {
  requirementFor,
  shapeOf,
} from "@/modules/benchmark/core/services/TaskCompatibility";
import { isUuid } from "./format";
import { ErrorState } from "./StateViews";

const TASK_TYPES: Array<{ value: CreateWorkloadInput["task_type"]; label: string }> = [
  { value: "text_generation", label: "Text generation" },
  { value: "code_generation", label: "Code generation" },
  { value: "image_recognition", label: "Image recognition" },
  { value: "multimodal", label: "Multimodal" },
];

interface Props {
  workloadId: string | null;
  /**
   * Controlled by DashboardApp rather than held here.
   *
   * It used to be local state handed up only when Continue was pressed, which
   * meant the installed-models panel showed the last COMMITTED class instead
   * of the one on screen: changing the dropdown appeared to do nothing until
   * you saved. One owner, one value, updated as you type.
   */
  taskType: CreateWorkloadInput["task_type"];
  onTaskTypeChange: (taskType: CreateWorkloadInput["task_type"]) => void;
  onReady: (workloadId: string) => void;
}

export function SetupPanel({
  workloadId,
  taskType,
  onTaskTypeChange,
  onReady,
}: Props) {
  const id = useId();

  const [wlBusy, setWlBusy] = useState(false);
  const [wlFailure, setWlFailure] = useState<ApiFailure | null>(null);
  const [wlUuid, setWlUuid] = useState(workloadId ?? "");

  // Both derived from the class. Nothing here is typed, so nothing here can
  // disagree with what the run actually does.
  const shape = shapeOf(taskType);
  const requirement = requirementFor(taskType);

  const submitWorkload = async () => {
    setWlBusy(true);
    setWlFailure(null);
    const res = await createWorkload({
      task_type: taskType,
      // The derived sentences are what get stored, so a row read back later
      // still says what the run sent and returned.
      input_format: shape.sends,
      output_format: shape.returns,
      constraints: {},
    });
    setWlBusy(false);
    if (!res.ok) {
      setWlFailure(res);
      return;
    }
    if (!isUuid(res.data.workload_id)) {
      // The endpoint answered 200 without a real row id. Do not advance on it.
      setWlFailure({
        ok: false,
        status: res.status,
        error: "Workload was not saved",
        details:
          "The server accepted the workload but did not return a database id, " +
          "so a benchmark run against it would fail later with 404. Nothing " +
          "was stored.",
      });
      return;
    }
    setWlUuid(res.data.workload_id);
  };

  const effectiveWorkload = wlUuid.trim();
  const workloadSaved = isUuid(effectiveWorkload);

  return (
    <section className="card" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>1 · Workload</h2>
      <p className="card-sub">
        A benchmark run is recorded against a workload — what kind of task it
        is, and what goes in and out. Describe it once and it is saved to this
        browser. Your machine is measured during the run, not described here.
      </p>

      <div className="field">
        <label htmlFor={`${id}-task`}>Task type</label>
        <select
          id={`${id}-task`}
          value={taskType}
          onChange={(e) =>
            onTaskTypeChange(e.target.value as CreateWorkloadInput["task_type"])
          }
        >
          {TASK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/*
        Stated, not asked. These used to be two free-text boxes defaulted to
        "plain text prompt" and "plain text answer" that nothing read - a user
        could type anything and it saved. They follow from the class, so the
        system says them and they change as the class changes.
      */}
      <dl className="callout" style={{ margin: "12px 0" }}>
        <dt style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
          What gets sent
        </dt>
        <dd style={{ margin: "2px 0 10px" }}>{shape.sends}</dd>

        <dt style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
          What comes back
        </dt>
        <dd style={{ margin: "2px 0 10px" }}>{shape.returns}</dd>

        <dt style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
          Needs
        </dt>
        <dd style={{ margin: "2px 0 0" }}>
          {requirement.needs}.
          {requirement.suitabilityUnverifiable ? (
            <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {requirement.caveat}
            </span>
          ) : null}
        </dd>
      </dl>

      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn" onClick={submitWorkload} disabled={wlBusy}>
          {wlBusy ? "Saving…" : workloadSaved ? "Save again" : "Save workload"}
        </button>
      </div>

      {wlFailure ? <ErrorState failure={wlFailure} onRetry={submitWorkload} /> : null}
      {workloadSaved && !wlFailure ? (
        <div className="callout callout-ok" role="status">
          <strong>Saved.</strong> This workload is stored and belongs to this
          browser.
        </div>
      ) : null}

      <div className="btn-row">
        <button
          className="btn btn-primary"
          disabled={!workloadSaved}
          onClick={() => onReady(effectiveWorkload)}
        >
          Continue to providers →
        </button>
        {!workloadSaved ? (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Save the workload to continue.
          </span>
        ) : null}
      </div>
    </section>
  );
}
