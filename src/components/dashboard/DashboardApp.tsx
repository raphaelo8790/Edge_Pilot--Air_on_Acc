"use client";

/**
 * EdgePilot benchmark dashboard — module owner: Kareem Ehab
 * (Product UI & Benchmark Dashboard Engineer / Integration Lead).
 *
 * The complete journey against the real /api/v1 backend:
 *   1 Workload & device → 2 Provider & model → 3 Run → 4 Results & readiness
 *
 * All server communication goes through ./api.ts (one typed gateway, one
 * envelope). No provider credential ever reaches this code — runs execute
 * server-side in the benchmark module.
 */
import { useEffect, useRef, useState } from "react";

import type { BenchmarkRun } from "./api";
import { ProviderPanel } from "./ProviderPanel";
import { RunPanel } from "./RunPanel";
import { RunResults } from "./RunResults";
import { SetupPanel } from "./SetupPanel";

type Step = 1 | 2 | 3 | 4;

export function DashboardApp() {
  const [step, setStep] = useState<Step>(1);
  const [workloadId, setWorkloadId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  // Move keyboard focus to the active step (WCAG: focus management).
  useEffect(() => {
    stepRef.current?.focus();
  }, [step]);

  const steps: Array<{ n: Step; label: string; enabled: boolean }> = [
    { n: 1, label: "Workload & device", enabled: true },
    { n: 2, label: "Provider", enabled: workloadId !== null && deviceId !== null },
    {
      n: 3,
      label: "Run",
      enabled: workloadId !== null && deviceId !== null && provider !== null && model.trim() !== "",
    },
    { n: 4, label: "Results", enabled: run !== null },
  ];

  return (
    <div className="epd">
      <header className="epd-header">
        <div className="epd-brand">
          Edge<span>Pilot</span> · Benchmark Dashboard
        </div>
        <div className="epd-tagline">
          workload → device → provider → measured run → readiness, with
          provenance on every number
        </div>
      </header>

      <main className="epd-main" id="epd-main">
        <nav aria-label="Progress">
          <ol className="stepper">
            {steps.map((s) => (
              <li key={s.n} className={step > s.n ? "step-done" : undefined}>
                <button
                  type="button"
                  disabled={!s.enabled}
                  aria-current={step === s.n ? "step" : undefined}
                  onClick={() => setStep(s.n)}
                >
                  <span className="step-index" aria-hidden="true">
                    {step > s.n ? "✓" : s.n}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div ref={stepRef} tabIndex={-1}>
          {step === 1 ? (
            <SetupPanel
              workloadId={workloadId}
              deviceId={deviceId}
              onReady={(w, d) => {
                setWorkloadId(w);
                setDeviceId(d);
                setStep(2);
              }}
            />
          ) : null}

          {step === 2 ? (
            <ProviderPanel
              selectedProvider={provider}
              model={model}
              onSelect={setProvider}
              onModel={setModel}
              onContinue={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          ) : null}

          {step === 3 && workloadId && deviceId && provider ? (
            <RunPanel
              workloadId={workloadId}
              deviceId={deviceId}
              provider={provider}
              model={model}
              onComplete={(r) => {
                setRun(r);
                setStep(4);
              }}
              onBack={() => setStep(2)}
            />
          ) : null}

          {step === 4 && run ? (
            <RunResults
              run={run}
              onRunAnother={() => setStep(3)}
              onStartOver={() => {
                setRun(null);
                setStep(1);
              }}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
