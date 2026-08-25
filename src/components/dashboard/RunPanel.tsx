"use client";

/**
 * Step 3 — run a controlled benchmark (POST /api/v1/benchmarks).
 *
 * A run performs real inference and can legitimately take minutes
 * (iterations × per-request timeout; the route sets maxDuration = 300), so
 * the loading state shows elapsed time. The "every provider failed" outcome
 * still carries the full run in `data` — that is evidence, and it is passed
 * on for rendering exactly like a success.
 */
import { useEffect, useId, useRef, useState } from "react";

import benchmarkTasks from "@/data/benchmark-tasks.json";
import { runBenchmark, type ApiFailure, type BenchmarkRun } from "./api";
import { fmtElapsed } from "./format";
import { ErrorState } from "./StateViews";

interface TaskEntry {
  id: number;
  name: string;
  modality: string;
  complexity: string;
  description: string;
}

const TASKS = (benchmarkTasks as { tasks: TaskEntry[] }).tasks.filter(
  (t) => t.modality !== "vision", // vision runs live in the vision dashboard
);

/** Controlled prompts per task (10 tasks; trusted data from the team sheet). */
const TASK_PROMPTS: Record<string, string> = {
  simple_qa_query:
    "Answer briefly: what is the capital of Japan, and what river runs through Cairo?",
  summarization:
    "Summarize in exactly 3 bullet points: The team meeting covered three topics. First, the deployment of the new API was delayed by a week because load testing revealed a memory leak in the benchmark runner. Second, the design review approved the dashboard mockups with the condition that the mobile layout is fixed before launch. Third, hiring for the two open backend roles will restart in September after the budget review.",
  code_generation:
    "Write a TypeScript function `median(values: number[]): number | null` that returns the median of an array, or null for an empty array. Include one usage example.",
  translation:
    "Translate to Arabic: 'The benchmark completed successfully on the local device. All measurements were recorded.'",
  sentiment_analysis:
    "Classify the sentiment of each review as positive, negative, or mixed. 1) 'Battery life is amazing but the screen scratches easily.' 2) 'Absolutely love it.' 3) 'Waste of money, returned it after two days.'",
  data_analysis:
    "Given this CSV, report the highest-revenue month and the average: month,revenue\\nJan,1200\\nFeb,1350\\nMar,990\\nApr,1600\\nMay,1480",
  creative_writing:
    "Write a four-line poem about a small computer running a large idea.",
  technical_explanation:
    "Explain to a first-year student, in one paragraph, why quantizing a language model reduces its memory footprint and what it can cost in quality.",
};

interface Props {
  workloadId: string;
  deviceId: string;
  provider: string;
  model: string;
  onComplete: (run: BenchmarkRun) => void;
  onBack: () => void;
}

export function RunPanel({
  workloadId,
  deviceId,
  provider,
  model,
  onComplete,
  onBack,
}: Props) {
  const id = useId();
  const [taskName, setTaskName] = useState<string>(TASKS[0]?.name ?? "");
  const [prompt, setPrompt] = useState<string>(
    TASK_PROMPTS[TASKS[0]?.name] ?? "",
  );
  const [iterations, setIterations] = useState(3);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const promptError =
    prompt.trim().length === 0
      ? "A prompt is required."
      : prompt.length > 10000
        ? "The prompt is limited to 10,000 characters."
        : null;
  const iterError =
    !Number.isInteger(iterations) || iterations < 1 || iterations > 100
      ? "Iterations must be a whole number between 1 and 100."
      : null;

  const run = async () => {
    if (promptError || iterError) return;
    setRunning(true);
    setFailure(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    const res = await runBenchmark({
      workload_id: workloadId,
      device_id: deviceId,
      provider: provider as "ollama" | "gemini" | "groq",
      model,
      prompt,
      iterations,
    });

    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);

    if (res.ok) {
      onComplete(res.data);
    } else if (res.failedRun) {
      // Every provider failed — the run is still evidence; show it.
      onComplete(res.failedRun);
    } else {
      setFailure(res);
    }
  };

  return (
    <section className="card" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>3 · Run a controlled benchmark</h2>
      <p className="card-sub">
        Provider <strong>{provider}</strong> · model <strong>{model}</strong>.
        The run happens server-side (keys never reach the browser) and every
        iteration is recorded with its provenance.
      </p>

      {running ? (
        <div className="state-panel" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p className="state-title">Benchmark running… {fmtElapsed(elapsed)}</p>
          <p className="state-detail">
            {iterations} iteration{iterations > 1 ? "s" : ""} of real inference
            against {provider}. Long runs are normal — up to the server’s
            per-request timeout per iteration. Leave this tab open.
          </p>
        </div>
      ) : (
        <>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-task`}>Controlled task (prompt preset)</label>
              <p className="hint">From the team’s benchmark task list; editable below.</p>
              <select
                id={`${id}-task`}
                value={taskName}
                onChange={(e) => {
                  setTaskName(e.target.value);
                  const preset = TASK_PROMPTS[e.target.value];
                  if (preset) setPrompt(preset);
                }}
              >
                {TASKS.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name} · {t.complexity}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-iter`}>Iterations (1–100)</label>
              <p className="hint">More iterations → better medians, longer run.</p>
              <input
                id={`${id}-iter`}
                type="number"
                min={1}
                max={100}
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
                aria-invalid={iterError ? true : undefined}
              />
              {iterError ? <p className="error-text">{iterError}</p> : null}
            </div>
            <div className="field span-2">
              <label htmlFor={`${id}-prompt`}>Prompt</label>
              <textarea
                id={`${id}-prompt`}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                aria-invalid={promptError ? true : undefined}
              />
              <p className="hint">{prompt.length.toLocaleString()} / 10,000 characters</p>
              {promptError && prompt.length > 0 ? (
                <p className="error-text">{promptError}</p>
              ) : null}
            </div>
          </div>

          {failure ? <ErrorState failure={failure} onRetry={run} /> : null}

          <div className="btn-row">
            <button className="btn" onClick={onBack}>
              ← Back
            </button>
            <button
              className="btn btn-primary"
              onClick={run}
              disabled={Boolean(promptError || iterError)}
            >
              Run benchmark
            </button>
          </div>
        </>
      )}
    </section>
  );
}
