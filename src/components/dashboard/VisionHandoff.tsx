"use client";

/**
 * What step 3 shows when the workload is an image task.
 *
 * THE DEFECT THIS CLOSES. The benchmark request carries `prompt` and nothing
 * else - there is no image field in BenchmarkRequest and no provider in this
 * module accepts one. So choosing "Image recognition" and pressing Run used to
 * send a text-only prompt, return 200, and produce latency and throughput
 * figures that had nothing to do with vision. It did not fail; it succeeded at
 * the wrong thing, which is worse, because the numbers look usable.
 *
 * Image workloads are measured by the vision benchmark, which sends the actual
 * dataset images and scores predictions against known labels. This hands over
 * rather than pretending.
 */
import Link from "next/link";

import type { LocalModel } from "./api";

interface Props {
  taskLabel: string;
  /** Installed models the runtime positively identified as vision-capable. */
  visionModels: LocalModel[];
  onBack: () => void;
}

export function VisionHandoff({ taskLabel, visionModels, onBack }: Props) {
  return (
    <section className="card" aria-labelledby="vision-handoff">
      <h2 id="vision-handoff">3 · Run — this is an image workload</h2>
      <p className="card-sub">
        {taskLabel} sends an image. This runner sends a text prompt and nothing
        else, so running it here would produce latency and throughput figures
        that measured no image at all.
      </p>

      <div className="callout callout-warn" role="status">
        <strong>Measured elsewhere, on purpose.</strong> Image workloads go
        through the vision benchmark, which sends the dataset images and scores
        each prediction against a known label — accuracy, macro F1 and
        invalid-output rate, not just speed.
      </div>

      {visionModels.length === 0 ? (
        <div className="callout" role="note">
          No vision model is installed. Pull one first — for example{" "}
          <code>ollama pull llava</code> — then run{" "}
          <code>npm run vision:run:ollama -- --model=llava</code>.
        </div>
      ) : (
        <div className="callout callout-ok" role="note">
          <strong>
            {visionModels.length} vision model
            {visionModels.length > 1 ? "s" : ""} installed.
          </strong>{" "}
          Run the benchmark against{" "}
          <code>
            npm run vision:run:ollama -- --model=
            {visionModels[0].name.split(":")[0]}
          </code>{" "}
          to record live evidence, then compare it on the vision dashboard.
          <ul className="list" style={{ marginTop: 6 }}>
            {visionModels.map((m) => (
              <li key={m.name}>
                <code>{m.name}</code>
                {m.parameter_size ? ` · ${m.parameter_size}` : ""} —{" "}
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {m.modality_reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="btn-row">
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
        <Link className="btn btn-primary" href="/vision-benchmark">
          Open the vision benchmark →
        </Link>
      </div>
    </section>
  );
}
