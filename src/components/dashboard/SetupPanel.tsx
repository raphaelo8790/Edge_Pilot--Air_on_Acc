"use client";

/**
 * Step 1 — register the workload and the target device.
 *
 * Uses the scaffold endpoints POST /api/v1/workloads and /api/v1/devices
 * (module: workload/device). Those endpoints validate with zod server-side
 * but do not persist yet — they echo placeholder ids. The panel says so
 * honestly when it happens and accepts an existing database UUID instead,
 * because POST /api/v1/benchmarks requires real rows (404 otherwise).
 * Dependency request to the module owners is documented in
 * docs/dashboard/README.md.
 */
import { useId, useState } from "react";

import {
  createDevice,
  createWorkload,
  type ApiFailure,
  type CreateWorkloadInput,
} from "./api";
import { isPlaceholderId, isUuid } from "./format";
import { ErrorState } from "./StateViews";

const TASK_TYPES: Array<{ value: CreateWorkloadInput["task_type"]; label: string }> = [
  { value: "text_generation", label: "Text generation" },
  { value: "code_generation", label: "Code generation" },
  { value: "image_recognition", label: "Image recognition" },
  { value: "multimodal", label: "Multimodal" },
];

interface Props {
  workloadId: string | null;
  deviceId: string | null;
  onReady: (workloadId: string, deviceId: string) => void;
}

export function SetupPanel({ workloadId, deviceId, onReady }: Props) {
  const id = useId();

  // workload form state
  const [taskType, setTaskType] =
    useState<CreateWorkloadInput["task_type"]>("text_generation");
  const [inputFormat, setInputFormat] = useState("plain text prompt");
  const [outputFormat, setOutputFormat] = useState("plain text answer");
  const [wlBusy, setWlBusy] = useState(false);
  const [wlFailure, setWlFailure] = useState<ApiFailure | null>(null);
  const [wlNotPersisted, setWlNotPersisted] = useState(false);
  const [wlUuid, setWlUuid] = useState(workloadId ?? "");

  // device form state
  const [devName, setDevName] = useState("");
  const [devCpu, setDevCpu] = useState("");
  const [devRam, setDevRam] = useState(16);
  const [devGpu, setDevGpu] = useState("");
  const [devStorage, setDevStorage] = useState(256);
  const [devBusy, setDevBusy] = useState(false);
  const [devFailure, setDevFailure] = useState<ApiFailure | null>(null);
  const [devNotPersisted, setDevNotPersisted] = useState(false);
  const [devUuid, setDevUuid] = useState(deviceId ?? "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submitWorkload = async () => {
    const errors: Record<string, string> = {};
    if (inputFormat.trim().length === 0) errors.input_format = "Required.";
    if (outputFormat.trim().length === 0) errors.output_format = "Required.";
    setFieldErrors((prev) => ({ ...prev, ...errors, ...(Object.keys(errors).length === 0 ? { input_format: "", output_format: "" } : {}) }));
    if (Object.keys(errors).length > 0) return;

    setWlBusy(true);
    setWlFailure(null);
    const res = await createWorkload({
      task_type: taskType,
      input_format: inputFormat.trim(),
      output_format: outputFormat.trim(),
      constraints: {},
    });
    setWlBusy(false);
    if (!res.ok) {
      setWlFailure(res);
      return;
    }
    if (isPlaceholderId(res.data.workload_id)) {
      // Scaffold echo — the row was NOT saved. Say so; do not pretend.
      setWlNotPersisted(true);
    } else {
      setWlUuid(res.data.workload_id);
    }
  };

  const submitDevice = async () => {
    const errors: Record<string, string> = {};
    if (devName.trim().length === 0) errors.dev_name = "Required.";
    if (devCpu.trim().length === 0) errors.dev_cpu = "Required.";
    if (!Number.isFinite(devRam) || devRam < 1) errors.dev_ram = "RAM must be ≥ 1 GB.";
    if (!Number.isFinite(devStorage) || devStorage < 1) errors.dev_storage = "Storage must be ≥ 1 GB.";
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    if (Object.keys(errors).length > 0) return;

    setDevBusy(true);
    setDevFailure(null);
    const res = await createDevice({
      name: devName.trim(),
      cpu: devCpu.trim(),
      ram_gb: Math.round(devRam),
      gpu: devGpu.trim() === "" ? null : devGpu.trim(),
      storage_gb: Math.round(devStorage),
      network: null,
    });
    setDevBusy(false);
    if (!res.ok) {
      setDevFailure(res);
      return;
    }
    if (isPlaceholderId(res.data.device_id)) {
      setDevNotPersisted(true);
    } else {
      setDevUuid(res.data.device_id);
    }
  };

  const effectiveWorkload = wlUuid.trim();
  const effectiveDevice = devUuid.trim();
  const ready = isUuid(effectiveWorkload) && isUuid(effectiveDevice);

  return (
    <section className="card" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>1 · Workload & device</h2>
      <p className="card-sub">
        A benchmark run is recorded against a workload and a device row in the
        database — both ids must be real UUIDs (POST /api/v1/benchmarks
        returns 404 for unknown rows).
      </p>

      <div className="form-grid">
        <div>
          <h3 style={{ marginTop: 0 }}>Workload</h3>
          <div className="field">
            <label htmlFor={`${id}-task`}>Task type</label>
            <select
              id={`${id}-task`}
              value={taskType}
              onChange={(e) =>
                setTaskType(e.target.value as CreateWorkloadInput["task_type"])
              }
            >
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-in`}>Input format</label>
            <input
              id={`${id}-in`}
              value={inputFormat}
              onChange={(e) => setInputFormat(e.target.value)}
              aria-invalid={fieldErrors.input_format ? true : undefined}
            />
            {fieldErrors.input_format ? (
              <p className="error-text">{fieldErrors.input_format}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor={`${id}-out`}>Output format</label>
            <input
              id={`${id}-out`}
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              aria-invalid={fieldErrors.output_format ? true : undefined}
            />
            {fieldErrors.output_format ? (
              <p className="error-text">{fieldErrors.output_format}</p>
            ) : null}
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={submitWorkload} disabled={wlBusy}>
              {wlBusy ? "Registering…" : "Register workload"}
            </button>
          </div>
          {wlFailure ? <ErrorState failure={wlFailure} onRetry={submitWorkload} /> : null}
          {wlNotPersisted ? (
            <div className="callout callout-warn" role="status">
              <strong>Not saved.</strong> The workloads endpoint is still a
              scaffold (it validates but does not persist — module owner’s
              TODO). Paste the UUID of an existing workload row below, or ask
              the module owner to seed one.
            </div>
          ) : null}
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor={`${id}-wluuid`}>Workload UUID</label>
            <p className="hint">Filled automatically once the endpoint persists rows.</p>
            <input
              id={`${id}-wluuid`}
              value={wlUuid}
              onChange={(e) => setWlUuid(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              aria-invalid={
                effectiveWorkload.length > 0 && !isUuid(effectiveWorkload)
                  ? true
                  : undefined
              }
            />
            {effectiveWorkload.length > 0 && !isUuid(effectiveWorkload) ? (
              <p className="error-text">Not a valid UUID.</p>
            ) : null}
          </div>
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>Device</h3>
          <div className="field">
            <label htmlFor={`${id}-dn`}>Name</label>
            <input
              id={`${id}-dn`}
              value={devName}
              onChange={(e) => setDevName(e.target.value)}
              placeholder='e.g. MacBook Air M1 (8 GB)'
              aria-invalid={fieldErrors.dev_name ? true : undefined}
            />
            {fieldErrors.dev_name ? <p className="error-text">{fieldErrors.dev_name}</p> : null}
          </div>
          <div className="field">
            <label htmlFor={`${id}-dc`}>CPU</label>
            <input
              id={`${id}-dc`}
              value={devCpu}
              onChange={(e) => setDevCpu(e.target.value)}
              placeholder="e.g. Apple M1"
              aria-invalid={fieldErrors.dev_cpu ? true : undefined}
            />
            {fieldErrors.dev_cpu ? <p className="error-text">{fieldErrors.dev_cpu}</p> : null}
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-dr`}>RAM (GB)</label>
              <input
                id={`${id}-dr`}
                type="number"
                min={1}
                value={devRam}
                onChange={(e) => setDevRam(Number(e.target.value))}
                aria-invalid={fieldErrors.dev_ram ? true : undefined}
              />
              {fieldErrors.dev_ram ? <p className="error-text">{fieldErrors.dev_ram}</p> : null}
            </div>
            <div className="field">
              <label htmlFor={`${id}-ds`}>Storage (GB)</label>
              <input
                id={`${id}-ds`}
                type="number"
                min={1}
                value={devStorage}
                onChange={(e) => setDevStorage(Number(e.target.value))}
                aria-invalid={fieldErrors.dev_storage ? true : undefined}
              />
              {fieldErrors.dev_storage ? (
                <p className="error-text">{fieldErrors.dev_storage}</p>
              ) : null}
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${id}-dg`}>GPU (optional)</label>
            <input
              id={`${id}-dg`}
              value={devGpu}
              onChange={(e) => setDevGpu(e.target.value)}
              placeholder="leave empty for none"
            />
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={submitDevice} disabled={devBusy}>
              {devBusy ? "Registering…" : "Register device"}
            </button>
          </div>
          {devFailure ? <ErrorState failure={devFailure} onRetry={submitDevice} /> : null}
          {devNotPersisted ? (
            <div className="callout callout-warn" role="status">
              <strong>Not saved.</strong> The devices endpoint is still a
              scaffold. Paste the UUID of an existing device row below.
            </div>
          ) : null}
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor={`${id}-devuuid`}>Device UUID</label>
            <input
              id={`${id}-devuuid`}
              value={devUuid}
              onChange={(e) => setDevUuid(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              aria-invalid={
                effectiveDevice.length > 0 && !isUuid(effectiveDevice)
                  ? true
                  : undefined
              }
            />
            {effectiveDevice.length > 0 && !isUuid(effectiveDevice) ? (
              <p className="error-text">Not a valid UUID.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="btn-row">
        <button
          className="btn btn-primary"
          disabled={!ready}
          onClick={() => onReady(effectiveWorkload, effectiveDevice)}
        >
          Continue to providers →
        </button>
        {!ready ? (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Both UUIDs must be valid to continue.
          </span>
        ) : null}
      </div>
    </section>
  );
}
