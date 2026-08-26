'use client';

/**
 * Run the built-in 21-image dataset from the page, and keep the result here.
 *
 * The gap this closes: the vision workload had a working server path and a
 * working browser path for your OWN images, but nothing that ran the dataset
 * this project ships with. The only way to measure the reference set was a
 * terminal command, which is a poor answer for a hosted tool.
 *
 * Results are stored in this browser, never on the server — see runHistory.ts
 * for why. That keeps `evidence/vision-benchmark/` meaning one thing: the
 * reference measurements committed with the project.
 *
 * THE TAG IS USED WHOLE. An earlier version of the handoff copy suggested
 * `--model=llava` by splitting the tag at the colon. Ollama does not resolve
 * that to llava:latest — it looks for a model that is not installed, and every
 * one of the 21 requests fails in a way that looks like a bad model rather
 * than a bad command. Never split the tag.
 */

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import { runBuiltInVisionBenchmark } from '@/app/vision-benchmark/actions';
import { getSessionId } from '@/components/dashboard/session';
import type { RunBuiltInResult } from '@/app/vision-benchmark/types';
import type { VisionBenchmarkEvidence } from '@/modules/vision-benchmark/core/types';
import {
  addRun,
  clearRuns,
  useStoredRuns,
  MAX_STORED_RUNS,
} from './runHistory';
import { ThresholdNote } from './ThresholdNote';

interface RuntimeModel {
  name: string;
  modality?: string;
  resident?: boolean | null;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Hands the visitor the run as a file, in the same shape the CLI writes. */
function download(evidence: VisionBenchmarkEvidence): void {
  const blob = new Blob([JSON.stringify(evidence, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `vision-${evidence.model.replace(/[^a-z0-9]+/gi, '-')}-${evidence.completedAt.replace(/[:.]/g, '-')}.json`.toLowerCase();
  anchor.click();
  URL.revokeObjectURL(url);
}

const notReported = '—';

function ms(value: number | null | undefined): string {
  return typeof value === 'number' ? `${value.toFixed(0)} ms` : notReported;
}

/** Bytes as GB. Null stays null: "not observed" is not "zero VRAM". */
function bytes(value: number | null | undefined): string {
  return typeof value === 'number'
    ? `${(value / 1024 ** 3).toFixed(2)} GB`
    : notReported;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-medium">{children}</th>;
}

function Td({
  children,
  breached = false,
}: {
  children: React.ReactNode;
  breached?: boolean;
}) {
  return (
    <td
      className={
        breached
          ? 'ep-mono whitespace-nowrap px-5 py-4 font-semibold text-bad-400'
          : 'ep-mono whitespace-nowrap px-5 py-4 text-mist-300'
      }
      title={breached ? 'Below this workload\u2019s threshold' : undefined}
    >
      {children}
    </td>
  );
}

export function RunBuiltInDataset() {
  const [models, setModels] = useState<RuntimeModel[]>([]);
  const [model, setModel] = useState('');
  const [runtimeNote, setRuntimeNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runs = useStoredRuns();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    fetch('/api/v1/local-runtime')
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;

        if (!body?.success || !body?.data?.ok) {
          setRuntimeNote(
            body?.data?.remedy ?? 'Ollama did not answer on the configured host.'
          );
          return;
        }

        const vision = (body.data.models as RuntimeModel[]).filter(
          (entry) => entry.modality === 'vision'
        );

        setModels(vision);

        // A model chosen on the dashboard arrives as ?model=<tag>. Preselect
        // it so the choice does not have to be made twice. Read from
        // window.location rather than useSearchParams: this component is
        // mounted by a page that would otherwise need a Suspense boundary,
        // and the value is only needed once, after mount.
        const wanted = (() => {
          try {
            return new URLSearchParams(window.location.search).get('model');
          } catch {
            return null;
          }
        })();

        const matched =
          wanted && vision.some((entry) => entry.name === wanted)
            ? wanted
            : null;

        setModel(matched ?? vision[0]?.name ?? '');

        // Asked for something that is not installed - say so rather than
        // silently running a different model than the one requested.
        if (wanted && !matched && vision.length > 0) {
          setRuntimeNote(
            `${wanted} is not installed as a vision model here, so ${vision[0].name} is selected instead.`
          );
        }

        if (vision.length === 0) {
          setRuntimeNote(
            'Ollama is running but no vision model is installed. Pull one, for example: ollama pull llava'
          );
        }
      })
      .catch(() => {
        if (!cancelled) setRuntimeNote('Could not reach this server to list local models.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function run() {
    setError(null);
    startTransition(async () => {
      // The id is passed explicitly because a server action is not routed
      // through the typed API client, so nothing attaches the session header
      // to it. Without this the run happens but the activity log never hears
      // about it.
      const result: RunBuiltInResult = await runBuiltInVisionBenchmark(
        model,
        getSessionId()
      );

      if (!result.ok || !result.evidence) {
        setError(result.error ?? 'The run failed for an unreported reason.');
        return;
      }

      addRun(result.evidence);
    });
  }

  return (
    <div className="card">
      <h3 className="card-sub">Run the built-in dataset</h3>
      <p className="card-sub">
        21 labelled images, seven classes. Identical to{' '}
        <code>npm run vision:run:ollama</code> — same workload id, same prompt,
        same prompt version — so a result from here is directly comparable to
        one from the terminal.
      </p>

      <ThresholdNote />

      <p className="card-sub">
        <strong>Your runs stay in this browser.</strong> Nothing is written to
        the server, so nobody else sees them and there is nothing to clean up.
        The last {MAX_STORED_RUNS} are kept; clearing your site data clears
        them. Download any run to keep it permanently.
      </p>

      {runtimeNote ? (
        <div className="callout callout-warn" role="note">
          {runtimeNote}
        </div>
      ) : null}

      <div className="btn-row">
        <div className="field">
          <label htmlFor="builtin-model">Vision model</label>
          <select
            id="builtin-model"
            value={model}
            disabled={pending || models.length === 0}
            onChange={(event) => setModel(event.target.value)}
          >
            {models.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
                {entry.resident === true ? ' · loaded' : ''}
                {entry.resident === false ? ' · cold start expected' : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={run}
          disabled={pending || !model}
        >
          {pending ? 'Running 21 images…' : 'Run benchmark'}
        </button>

        {runs.length > 0 ? (
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => {
              clearRuns();
            }}
          >
            Clear my runs
          </button>
        ) : null}
      </div>

      {pending ? (
        <p className="card-sub" role="status">
          One warm-up classification runs first and is discarded, then 21
          measured requests. A cold model can take a minute before the first
          answer.
        </p>
      ) : null}

      {error ? (
        <div className="callout callout-error" role="alert">
          {error}
        </div>
      ) : null}

      {runs.length > 0 ? (
        <>
          <h4 className="card-sub" style={{ marginTop: 18 }}>
            Your runs ({runs.length}) — this browser only
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="ep-mono bg-ink-950/70 text-[11px] uppercase tracking-wider text-mist-500">
                <tr>
                  <Th>Model</Th>
                  <Th>Accuracy</Th>
                  <Th>Macro F1</Th>
                  <Th>Invalid</Th>
                  <Th>Success</Th>
                  <Th>Median</Th>
                  <Th>Prompt eval</Th>
                  <Th>Tok/s</Th>
                  <Th>VRAM</Th>
                  <Th>Gate</Th>
                  <Th>Evidence</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {runs.map((entry) => {
                  const m = entry.evidence.metrics;
                  const t = entry.evidence.thresholds;
                  return (
                    <tr
                      key={`${entry.storedAt}-${entry.evidence.model}`}
                      className="transition hover:bg-ink-800/50"
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-mist-100">
                          {entry.evidence.model}
                        </div>
                        <div className="ep-mono mt-1 text-xs text-mist-600">
                          {new Date(entry.storedAt).toLocaleString()}
                        </div>
                      </td>
                      {/* A breached cell is marked, so "why did it fail" is
                          answered in the row rather than left to the reader. */}
                      <Td breached={m.exactMatchAccuracy < t.minimumAccuracy}>
                        {pct(m.exactMatchAccuracy)}
                      </Td>
                      <Td breached={m.macroF1 < t.minimumMacroF1}>
                        {m.macroF1.toFixed(3)}
                      </Td>
                      <Td
                        breached={
                          m.invalidOutputRate > t.maximumInvalidOutputRate
                        }
                      >
                        {pct(m.invalidOutputRate)}
                      </Td>
                      <Td
                        breached={
                          m.successfulRequestRate <
                          t.minimumSuccessfulRequestRate
                        }
                      >
                        {pct(m.successfulRequestRate)}
                      </Td>
                      <Td>{ms(m.medianLatencyMs)}</Td>
                      <Td>{ms(m.medianPromptEvalMs)}</Td>
                      <Td>
                        {typeof m.medianTokensPerSecond === 'number'
                          ? m.medianTokensPerSecond.toFixed(1)
                          : notReported}
                      </Td>
                      <Td>{bytes(entry.evidence.hardwareFit?.vramBytes)}</Td>
                      <td className="px-5 py-4">
                        <span
                          className={
                            entry.evidence.passed
                              ? 'rounded-md border border-good-400/40 bg-good-400/10 px-2.5 py-1 text-xs font-semibold text-good-400'
                              : 'rounded-md border border-bad-400/40 bg-bad-400/10 px-2.5 py-1 text-xs font-semibold text-bad-400'
                          }
                        >
                          {entry.evidence.passed ? 'Pass' : 'Fail'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => download(entry.evidence)}
                        >
                          download
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="card-sub">
            <Link href="/history">Session history</Link> has all of these
            together with the activity log, bulk download, and sharing.
          </p>
          <p className="card-sub">
            A highlighted cell is the one that missed its threshold. Blank
            columns mean the runtime reported nothing for them — not zero.
            {runs.some((entry) => (entry.evidence.metrics.modelLoadMs ?? 0) > 0)
              ? ' A run also reloaded the model mid-measurement; its latencies include that cost.'
              : ''}
          </p>
        </>
      ) : null}
    </div>
  );
}
