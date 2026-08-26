"use client";

/**
 * EdgePilot benchmark dashboard — module owner: Kareem Ehab
 * (Product UI & Benchmark Dashboard Engineer / Integration Lead).
 *
 * The complete journey against the real /api/v1 backend:
 *   1 Workload → 2 Provider & model → 3 Run → 4 Results & readiness
 *
 * All server communication goes through ./api.ts (one typed gateway, one
 * envelope). No provider credential ever reaches this code — runs execute
 * server-side in the benchmark module.
 */
import { useEffect, useRef, useState } from "react";

import { ArcadeNavLinks } from "@/components/ArcadeNav";
import { PaletteToggle } from "@/components/PaletteToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

import type { BenchmarkRun } from "./api";
import { addBenchmarkRun } from "@/components/vision/runHistory";
import { requirementFor, type TaskType } from "@/modules/benchmark/core/services/TaskCompatibility";
import { getLocalRuntime, type LocalModel } from "./api";
import { InstalledModels } from "./InstalledModels";
import { VisionHandoff } from "./VisionHandoff";
import { ProviderPanel } from "./ProviderPanel";
import { RunPanel } from "./RunPanel";
import { RunResults } from "./RunResults";
import { SetupPanel } from "./SetupPanel";

type Step = 1 | 2 | 3 | 4;

export function DashboardApp() {
  const [step, setStep] = useState<Step>(1);
  const [workloadId, setWorkloadId] = useState<string | null>(null);
  // Owned here, not in SetupPanel, so the installed-models panel reflects the
  // class currently selected rather than the last one saved. Starts at the
  // value the dropdown shows, so the two never disagree.
  const [taskType, setTaskType] = useState<TaskType>("text_generation");
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const stepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    getLocalRuntime().then((res) => {
      if (!cancelled) {
        setLocalModels(res.ok && res.data.ok ? res.data.models : []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // An image workload is not measured by this runner at all - see
  // VisionHandoff. It therefore does not need a provider or a model chosen
  // before step 3, because step 3 hands over rather than running anything.
  const isVisionTask = requirementFor(taskType).modality === "vision";
  const visionModels = localModels.filter((m) => m.modality === "vision");

  // Move keyboard focus to the active step (WCAG: focus management).
  useEffect(() => {
    stepRef.current?.focus();
  }, [step]);

  const steps: Array<{ n: Step; label: string; enabled: boolean }> = [
    { n: 1, label: "Workload", enabled: true },
    { n: 2, label: "Provider", enabled: workloadId !== null },
    {
      n: 3,
      label: "Run",
      enabled: isVisionTask
        ? workloadId !== null
        : workloadId !== null && provider !== null && model.trim() !== "",
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
          workload → provider → measured run → readiness, with
          provenance on every number
          {" · "}
          <ArcadeNavLinks
            items={[
              { href: "/", label: "Home" },
              { href: "/compare", label: "Compare" },
              { href: "/evidence", label: "Evidence" },
              { href: "/evaluation", label: "Matrix" },
              { href: "/vision-benchmark", label: "Vision" },
              { href: "/history", label: "Session history" },
              { href: "/setup", label: "Setup" },
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
              taskType={taskType}
              onTaskTypeChange={setTaskType}
              onReady={(w) => {
                setWorkloadId(w);
                setStep(2);
              }}
            />
          ) : null}

          {step === 2 ? (
            <ProviderPanel
              taskType={taskType}
              selectedProvider={provider}
              model={model}
              onSelect={(next) => {
                // A model name belongs to one provider's catalogue; carrying
                // it across would submit a Groq name to Gemini.
                if (next !== provider) setModel("");
                setProvider(next);
              }}
              onModel={setModel}
              onContinue={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          ) : null}

          {step === 3 && workloadId && isVisionTask ? (
            <VisionHandoff
              taskLabel={
                taskType === "image_recognition"
                  ? "Image recognition"
                  : "Multimodal"
              }
              visionModels={visionModels}
              selectedModel={model}
              onBack={() => setStep(2)}
            />
          ) : null}

          {step === 3 && workloadId && provider && !isVisionTask ? (
            <RunPanel
              workloadId={workloadId}
              provider={provider}
              model={model}
              onComplete={(r) => {
                setRun(r);
                // Keep it. Before this the run vanished the moment you
                // navigated away, and /history could only ever show vision
                // runs. Stored in this browser, never uploaded.
                addBenchmarkRun(r);
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

        {/*
          Outside the step switch on purpose: what is installed is true at
          every step, and a user picking a task in step 1 should be able to see
          straight away which of their models it rules out.
        */}
        {/*
          Step 1 is where you are still deciding, so it shows everything and
          greys what the chosen class rules out - hiding a model there would
          leave someone wondering where it went. From step 2 onward the
          decision is made and the incompatible ones are only noise, so the
          panel lists what can actually run.
        */}
        <div style={{ marginTop: 20 }}>
          <InstalledModels
            taskType={taskType}
            mode={step === 1 ? "grey" : "usable-only"}
          />
        </div>
      </main>
    </div>
  );
}
