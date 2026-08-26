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
import { getProviderModels, type CloudModel } from '@/components/dashboard/api';
import { readApiKey } from '@/components/dashboard/apiKeys';
import { ProviderLogo } from '@/components/dashboard/ProviderLogo';
import { runBuiltInDatasetInBrowser } from './builtInDataset';
import type { RunBuiltInResult } from '@/app/vision-benchmark/types';
import type { VisionBenchmarkEvidence } from '@/modules/vision-benchmark/core/types';
import {
  addRun,
  clearRuns,
  useStoredRuns,
  MAX_STORED_RUNS,
} from './runHistory';
import { ThresholdNote } from './ThresholdNote';
import { probeBrowserOllama } from '@/modules/benchmark/infrastructure/browser-ollama';

interface RuntimeModel {
  name: string;
  modality?: string;
  resident?: boolean | null;
}

type VisionProviderName = 'ollama' | 'gemini' | 'groq';

const PROVIDER_LABEL: Record<VisionProviderName, string> = {
  ollama: 'Ollama · this computer',
  gemini: 'Gemini · cloud',
  groq: 'Groq · cloud',
};

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
  const [provider, setProvider] = useState<VisionProviderName>('ollama');
  const [models, setModels] = useState<RuntimeModel[]>([]);
  const [model, setModel] = useState('');
  const [runtimeNote, setRuntimeNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const runs = useStoredRuns();
  const [pending, startTransition] = useTransition();

  // Cloud catalogues, asked once each. Only models the vendor lists as able
  // to take an image are offered; a text-only model would fail every sample.
  const [cloudModels, setCloudModels] = useState<
    Partial<Record<'gemini' | 'groq', { models: CloudModel[]; note: string | null }>>
  >({});
  const [cloudModel, setCloudModel] = useState<Record<'gemini' | 'groq', string>>({
    gemini: '',
    groq: '',
  });

  useEffect(() => {
    if (provider === 'ollama' || cloudModels[provider]) return;

    const name = provider;
    let cancelled = false;

    getProviderModels(name).then((res) => {
      if (cancelled) return;

      if (!res.ok) {
        setCloudModels((c) => ({ ...c, [name]: { models: [], note: res.error } }));
        return;
      }

      const vision = res.data.models.filter((m) => m.supports_vision);
      setCloudModels((c) => ({
        ...c,
        [name]: {
          models: vision,
          note: res.data.ok
            ? vision.length === 0
              ? `${name === 'gemini' ? 'Gemini' : 'Groq'} listed no model that accepts images for this key.`
              : null
            : `${res.data.message} ${res.data.remedy ?? ''}`,
        },
      }));
      setCloudModel((c) => (c[name] ? c : { ...c, [name]: vision[0]?.name ?? '' }));
    });

    return () => {
      cancelled = true;
    };
  }, [provider, cloudModels]);

  useEffect(() => {
    let cancelled = false;

    // The visitor's own Ollama, asked from this tab. The server's list is
    // the wrong machine once the app is hosted.
    probeBrowserOllama()
      .then((runtime) => {
        if (cancelled) return;

        if (!runtime.ok) {
          setRuntimeNote(runtime.remedy ?? runtime.message);
          return;
        }

        const vision = (runtime.models as RuntimeModel[]).filter(
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
        if (!cancelled) setRuntimeNote('Could not ask the local runtime for its models.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const chosenModel = provider === 'ollama' ? model : cloudModel[provider];

  function run() {
    setError(null);
    setProgress(null);
    startTransition(async () => {
      if (provider === 'ollama') {
        // The local run happens HERE, against the Ollama on this computer.
        // A hosted server has none, and cannot reach this one.
        try {
          const evidence = await runBuiltInDatasetInBrowser({
            model,
            onProgress: setProgress,
          });
          addRun(evidence);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
          setProgress(null);
        }
        return;
      }

      // A cloud run happens on the server, where a key can be kept out of
      // the page. Everything is passed explicitly: a server action is not
      // routed through the typed API client, so nothing attaches the session
      // or key headers to it.
      const result: RunBuiltInResult = await runBuiltInVisionBenchmark({
        provider,
        model: cloudModel[provider],
        sessionId: getSessionId(),
        keys: { gemini: readApiKey('gemini'), groq: readApiKey('groq') },
      });

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
        <code>npm run vision:run:ollama</code> and{' '}
        <code>vision:run:gemini</code> — same workload id, same prompt, same
        prompt version — so a result from here is directly comparable to one
        from the terminal. A local model is called from this browser; a cloud
        model is called by the server with your key or the site&apos;s.
      </p>

      <ThresholdNote />

      <p className="card-sub">
        <strong>Your runs stay in this browser.</strong> Nothing is written to
        the server, so nobody else sees them and there is nothing to clean up.
        The last {MAX_STORED_RUNS} are kept; clearing your site data clears
        them. Download any run to keep it permanently.
      </p>

      <div className="btn-row" role="radiogroup" aria-label="Provider">
        {(['ollama', 'gemini', 'groq'] as VisionProviderName[]).map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={provider === choice}
            className={provider === choice ? 'btn btn-primary' : 'btn'}
            disabled={pending}
            onClick={() => setProvider(choice)}
          >
            <ProviderLogo provider={choice} size={14} style={{ marginRight: 6 }} />
            {PROVIDER_LABEL[choice]}
          </button>
        ))}
      </div>

      {provider === 'ollama' && runtimeNote ? (
        <div className="callout callout-warn" role="note">
          {runtimeNote}
        </div>
      ) : null}

      {provider !== 'ollama' && cloudModels[provider]?.note ? (
        <>
          <div className="callout callout-warn" role="note">
            {cloudModels[provider]?.note}
          </div>
          <p className="hint" style={{ margin: '-6px 0 10px 14px' }}>
            Want to use your own API key?{' '}
            <Link href="/setup">Add it on the setup page</Link>.
          </p>
        </>
      ) : null}

      <div className="btn-row btn-row-baseline">
        <div className="field">
          <label htmlFor="builtin-model">Vision model</label>
          {provider === 'ollama' ? (
            <select
              id="builtin-model"
              value={model}
              disabled={pending || models.length === 0}
              onChange={(event) => setModel(event.target.value)}
            >
              <option value="" disabled>
                {models.length === 0 ? 'No vision model installed…' : 'Choose a model…'}
              </option>
              {models.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name}
                  {entry.resident === true ? ' · loaded' : ''}
                  {entry.resident === false ? ' · cold start expected' : ''}
                </option>
              ))}
            </select>
          ) : (
            <select
              id="builtin-model"
              value={cloudModel[provider]}
              disabled={pending || !cloudModels[provider] || cloudModels[provider]?.models.length === 0}
              onChange={(event) =>
                setCloudModel((c) => ({ ...c, [provider]: event.target.value }))
              }
            >
              <option value="" disabled>
                {!cloudModels[provider] ? 'Asking the provider…' : 'Choose a model…'}
              </option>
              {(cloudModels[provider]?.models ?? []).map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.display_name !== entry.name ? `${entry.display_name} · ` : ''}
                  {entry.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={run}
          disabled={pending || !chosenModel}
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
        <p className="card-sub" role="status" aria-live="polite">
          {progress ??
            (provider === 'ollama'
              ? 'One warm-up classification runs first and is discarded, then 21 measured requests. A cold model can take a minute before the first answer.'
              : '21 requests to the provider, one image each. Usually well under a minute.')}
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
                          <ProviderLogo
                            provider={entry.evidence.provider}
                            size={13}
                            style={{ marginRight: 6 }}
                          />
                          {entry.evidence.model}
                        </div>
                        <div className="ep-mono mt-1 text-xs text-mist-600">
                          {entry.evidence.provider} · {new Date(entry.storedAt).toLocaleString()}
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
