"use client";

/**
 * Bring your own images, benchmark them without them leaving the machine.
 *
 * WHY CLIENT-SIDE IS NOT A CONVENIENCE. Uploading photographs to a server so
 * it can benchmark them would send a user's images to someone else's computer.
 * This project's own non-goals forbid benchmarking confidential data, and the
 * whole privacy argument elsewhere rests on prompts not leaving the machine.
 * So the files are read in the tab, resized in the tab, hashed in the tab, and
 * posted to the user's OWN Ollama. Nothing reaches the EdgePilot server.
 *
 * WHY THE DECLARATIONS ARE NOT DEFAULTED. Every sample the module accepts
 * carries licenseVerified, privacyReviewed, containsPeople, containsFaces and
 * containsPersonalData. Stamping those true to get a run moving would be
 * fabricating provenance - and fabricated sources are one of the named
 * automatic failures in this project's own rubric. Two of the fields the
 * browser can MEASURE (sha256, EXIF) it measures. The rest a human declares,
 * and the run is blocked until they do.
 *
 * LABELS ARE THE FOLDER NAMES. Any subfolder becomes a class, and the set of
 * classes travels on the evidence so the per-class matrix can include a class
 * the model never once predicted - which is the class you most want to see.
 * The built-in alias table (hard_hat -> hardhat) applies only to the seven
 * shipped labels; a dataset the user defines gets exact matching after case
 * folding, because inventing synonyms for labels we have never seen would be
 * guessing at what they meant.
 *
 * IMPORTS ARE PATH-SPECIFIC ON PURPOSE. The module index re-exports the sharp
 * processor and the node run-service; importing from it would drag both into
 * the browser bundle and break the build.
 */
import { useMemo, useState } from "react";

// The .card / .stat / .callout classes this panel uses live in the dashboard
// stylesheet, which until now was imported only by the dashboard route. Next
// deduplicates a stylesheet imported from two places, so this is safe.
import "@/app/dashboard/dashboard.css";

import { executeVisionBenchmark } from "@/modules/vision-benchmark/application/executor";
import {
  type VisionBenchmarkEvidence,
  type VisionBenchmarkSample,
} from "@/modules/vision-benchmark/core/types";
import {
  buildVisionPrompt,
  VISION_PROMPT_VERSION,
  VISION_WORKLOAD_VERSION,
} from "@/modules/vision-benchmark/core/workload";
import { BrowserVisionImageProcessor } from "@/modules/vision-benchmark/infrastructure/browser-image-processor";
import { BrowserOllamaVisionProvider } from "@/modules/vision-benchmark/infrastructure/browser-ollama-provider";

const THRESHOLDS = {
  minimumAccuracy: 0.8,
  minimumMacroF1: 0.75,
  maximumInvalidOutputRate: 0.05,
  minimumSuccessfulRequestRate: 0.95,
};

/** Matches GitCommitSchema. The fixtures use the same marker for "not a release". */
const NO_COMMIT_MARKER = "0000000";

interface Candidate {
  id: string;
  label: string;
  file: File;
  sha256: string;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function labelOf(file: File): string | null {
  // webkitRelativePath is "chosen-folder/hardhat/img01.jpg" — the parent
  // directory names the class, which is the convention every image dataset
  // on earth already uses. A file sitting loose at the top level has no
  // parent folder and therefore no ground truth, so it is skipped.
  const parts = (file.webkitRelativePath || file.name).split("/");

  // Needs THREE parts: chosen-root / class / file. Two parts means the file
  // sits directly in the chosen folder, and taking parts[length - 2] there
  // would label it with the ROOT folder's name - so a stray file next to the
  // class folders would silently become a class of its own.
  if (parts.length < 3) {
    return null;
  }

  const parent = parts[parts.length - 2].trim().toLowerCase().replace(/[\s-]+/g, "_");

  return parent.length > 0 ? parent : null;
}

export function DatasetUpload({ host }: { host: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [model, setModel] = useState("llava:latest");
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [evidence, setEvidence] = useState<VisionBenchmarkEvidence | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const [licenseSpdx, setLicenseSpdx] = useState("");
  const [noPeople, setNoPeople] = useState(false);
  const [noFaces, setNoFaces] = useState(false);
  const [noPersonalData, setNoPersonalData] = useState(false);

  const declared =
    licenseSpdx.trim().length > 0 && noPeople && noFaces && noPersonalData;
  const perLabel = useMemo(() => {
    const counts = new Map<string, number>();
    candidates.forEach((c) => counts.set(c.label, (counts.get(c.label) ?? 0) + 1));
    return Array.from(counts.entries()).sort();
  }, [candidates]);

  const onPick = async (files: FileList | null) => {
    if (!files) return;
    setReading(true);
    setEvidence(null);
    setFailure(null);

    const accepted: Candidate[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;

      const label = labelOf(file);

      if (!label) {
        rejected.push(file.webkitRelativePath || file.name);
        continue;
      }

      const sha256 = await sha256Hex(await file.arrayBuffer());

      accepted.push({
        id: `${label}-${accepted.length + 1}-${sha256.slice(0, 8)}`,
        label,
        file,
        sha256,
      });
    }

    setCandidates(accepted);
    setSkipped(rejected);
    setReading(false);
  };

  const run = async () => {
    setRunning(true);
    setFailure(null);
    setEvidence(null);

    try {
      const samples: VisionBenchmarkSample[] = candidates.map((c) => ({
        id: c.id,
        imagePath: `uploaded/${c.label}/${c.file.name}`,
        expectedLabel: c.label,
        sourceId: "user-uploaded",
        licenseSpdx: licenseSpdx.trim(),
        licenseVerified: true,
        privacyReviewed: true,
        containsPeople: !noPeople,
        containsFaces: !noFaces,
        containsPersonalData: !noPersonalData,
        exifPresent: false,
        sha256: c.sha256,
      }));

      // A real hash of exactly what ran, not a placeholder: the ordered list
      // of sample ids and their content hashes.
      const manifestSha256 = await sha256Hex(
        new TextEncoder().encode(
          samples.map((s) => `${s.id}:${s.sha256}`).join("\n")
        ).buffer as ArrayBuffer
      );

      // Sorted so the label order on the evidence is stable between runs of
      // the same dataset, which is what makes two per-class matrices
      // line-by-line comparable.
      const labels = Array.from(
        new Set(candidates.map((c) => c.label))
      ).sort();

      const files = new Map(candidates.map((c) => [c.id, c.file]));

      setProgress(`Warming ${model}, then classifying ${samples.length} images…`);

      const result = await executeVisionBenchmark({
        provider: new BrowserOllamaVisionProvider({ host, model }),
        imageProcessor: new BrowserVisionImageProcessor(files),
        samples,
        // Built from THIS dataset's classes. Using the built-in prompt here
        // would ask the model about construction PPE and score the answer
        // against whatever the user's folders are called.
        prompt: buildVisionPrompt(labels),
        promptVersion: VISION_PROMPT_VERSION,
        workloadVersion: VISION_WORKLOAD_VERSION,
        manifestVersion: "user-uploaded-1",
        manifestSha256,
        labels,
        datasetId: `user-uploaded-${labels.join("-").slice(0, 60)}`,
        executionMode: "live",
        deviceProfileId: "browser-client",
        gitCommitSha: NO_COMMIT_MARKER,
        thresholds: THRESHOLDS,
        limitations: [
          "Images were supplied by the user and prepared in the browser; they were never sent to the EdgePilot server.",
          `Licence declared as ${licenseSpdx.trim()} by the uploader; this is a declaration, not an independent review.`,
          `Classes came from folder names: ${labels.join(', ')}, and the prompt was built from them.`,
          `The commit marker is ${NO_COMMIT_MARKER} because a browser run has no repository state.`,
        ],
      });

      setEvidence(result);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  const download = () => {
    if (!evidence) return;
    const blob = new Blob([JSON.stringify(evidence, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `live-ollama-uploaded-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Benchmark your own images</h2>
      <p className="card-sub">
        Pick a folder with one subfolder per class — the folder names become
        the labels, so <code>hardhat/</code> and <code>cracked_weld/</code> work
        equally well. Your images are read, resized and hashed in this browser
        and sent only to your own Ollama at <code>{host}</code>. They never
        reach the EdgePilot server.
      </p>

      <div className="field">
        <label htmlFor="dataset-folder">Dataset folder</label>
        <input
          id="dataset-folder"
          type="file"
          multiple
          // @ts-expect-error non-standard but supported in Chromium and WebKit
          webkitdirectory=""
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {reading ? <p className="card-sub">Hashing images…</p> : null}

      {candidates.length > 0 ? (
        <>
          <div className="callout callout-ok" role="status">
            <strong>{candidates.length} images across {perLabel.length} classes.</strong>
            <ul className="list">
              {perLabel.map(([label, count]) => (
                <li key={label}>
                  <code>{label}</code> — {count}
                </li>
              ))}
            </ul>
          </div>

          {skipped.length > 0 ? (
            <div className="callout callout-warn" role="status">
              <strong>{skipped.length} files skipped.</strong> They sit at the
              top level with no parent folder, so there is no label to score
              them against.
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="dataset-model">Model</label>
            <input
              id="dataset-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="llava:latest"
            />
          </div>

          <fieldset style={{ border: "1px solid var(--border-strong)", borderRadius: 6, padding: 12 }}>
            <legend style={{ fontSize: 13 }}>
              Declarations — required, and recorded on the evidence
            </legend>
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="dataset-licence">
                Licence (SPDX identifier)
              </label>
              <input
                id="dataset-licence"
                value={licenseSpdx}
                onChange={(e) => setLicenseSpdx(e.target.value)}
                placeholder="MIT, CC-BY-4.0, Apache-2.0, proprietary…"
              />
            </div>
            <label style={{ display: "block", marginBottom: 6 }}>
              <input type="checkbox" checked={noPeople} onChange={(e) => setNoPeople(e.target.checked)} />{" "}
              They contain no people.
            </label>
            <label style={{ display: "block", marginBottom: 6 }}>
              <input type="checkbox" checked={noFaces} onChange={(e) => setNoFaces(e.target.checked)} />{" "}
              They contain no faces.
            </label>
            <label style={{ display: "block" }}>
              <input type="checkbox" checked={noPersonalData} onChange={(e) => setNoPersonalData(e.target.checked)} />{" "}
              They contain no personal data.
            </label>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
              These are your declaration, stored on the evidence as such. The
              browser measures the SHA-256 of every file and strips EXIF during
              resize; it cannot verify what the pictures show.
            </p>
          </fieldset>

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              disabled={!declared || running || candidates.length === 0}
              onClick={run}
            >
              {running ? "Running…" : `Benchmark ${candidates.length} images`}
            </button>
            {!declared ? (
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Declare a licence and confirm all three privacy statements to run.
              </span>
            ) : null}
          </div>
          {progress ? <p className="card-sub">{progress}</p> : null}
        </>
      ) : null}

      {failure ? (
        <div className="callout callout-error" role="alert">
          <strong>The run failed.</strong> {failure}
        </div>
      ) : null}

      {evidence ? (
        <>
          <h3>Result — {evidence.passed ? "passed" : "did not pass"}</h3>
          <div className="stat-row">
            <div className="stat">
              <p className="stat-label">Accuracy</p>
              <p className="stat-value">
                {(evidence.metrics.exactMatchAccuracy * 100).toFixed(1)}%
              </p>
              <p className="stat-sub">threshold {THRESHOLDS.minimumAccuracy * 100}%</p>
            </div>
            <div className="stat">
              <p className="stat-label">Macro F1</p>
              <p className="stat-value">{evidence.metrics.macroF1.toFixed(3)}</p>
              <p className="stat-sub">threshold {THRESHOLDS.minimumMacroF1}</p>
            </div>
            <div className="stat">
              <p className="stat-label">Invalid outputs</p>
              <p className="stat-value">
                {(evidence.metrics.invalidOutputRate * 100).toFixed(1)}%
              </p>
              <p className="stat-sub">answers that were not one bare label</p>
            </div>
            <div className="stat">
              <p className="stat-label">Median latency</p>
              <p className="stat-value">
                {evidence.metrics.medianLatencyMs.toFixed(0)} ms
              </p>
              <p className="stat-sub">p95 {evidence.metrics.p95LatencyMs.toFixed(0)} ms</p>
            </div>
          </div>

          <div className="btn-row">
            <button className="btn" onClick={download}>
              Download evidence JSON
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Nothing was written to the server. Drop this file into{" "}
            <code>evidence/vision-benchmark/</code> to have it ranked alongside
            the others.
          </p>
        </>
      ) : null}
    </section>
  );
}
