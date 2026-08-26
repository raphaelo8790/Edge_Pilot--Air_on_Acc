import path from 'node:path';
import Link from 'next/link';
import {
  rankVisionDashboardRows,
  toVisionDashboardRow,
} from '@/modules/vision-benchmark/application/dashboard';
import { VisionDashboardRow } from '@/modules/vision-benchmark/core/types';
import { FileVisionEvidenceStore } from '@/modules/vision-benchmark/infrastructure/evidence-store';
import { DatasetUpload } from '@/components/vision/DatasetUpload';
import { RunBuiltInDataset } from '@/components/vision/RunBuiltInDataset';
import { ProviderLogo } from '@/components/dashboard/ProviderLogo';
import { ArcadeNavLinks } from '@/components/ArcadeNav';
import { PaletteToggle } from '@/components/PaletteToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import '../dashboard/dashboard.css';

export const dynamic = 'force-dynamic';

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function milliseconds(value: number): string {
  return `${value.toFixed(1)} ms`;
}

async function loadRows(): Promise<VisionDashboardRow[]> {
  const store = new FileVisionEvidenceStore(
    path.join(process.cwd(), 'evidence', 'vision-benchmark')
  );
  const evidence = await store.readAll();

  return rankVisionDashboardRows(
    evidence.map(toVisionDashboardRow)
  );
}

export default async function VisionBenchmarkPage() {
  const rows = await loadRows();
  const best = rows[0];

  return (
    <main className="min-h-dvh bg-ink-950 px-5 py-12 text-mist-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="ep-label ep-rise mb-4">
              EdgePilot · vision module
            </p>
            <h1 className="ep-rise ep-rise-1 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Vision benchmark comparison
            </h1>
            <p className="ep-rise ep-rise-2 mt-4 max-w-2xl leading-relaxed text-mist-400">
              Compare local and cloud component-recognition runs using
              deterministic metrics, validated evidence, and the same
              21-image workload.
            </p>
            <div className="ep-rise ep-rise-2 mt-4 text-sm text-mist-400">
              <ArcadeNavLinks
                items={[
                  { href: '/', label: 'home' },
                  { href: '/dashboard', label: 'dashboard' },
                  { href: '/compare', label: 'compare' },
                  { href: '/evidence', label: 'evidence' },
                  { href: '/evaluation', label: 'matrix' },
                  { href: '/history', label: 'history' },
                ]}
              />
            </div>
          </div>
          <div className="ep-rise ep-rise-2 flex items-center gap-2">
            <PaletteToggle className="rounded-lg border border-ink-600 px-3 py-2 text-xs text-mist-400 transition hover:border-pulse-500 hover:text-mist-100" />
            <ThemeToggle className="rounded-lg border border-ink-600 px-3 py-2 text-sm text-mist-400 transition hover:border-pulse-500 hover:text-mist-100" />
            <Link
              href="/"
              className="w-fit rounded-lg border border-ink-600 px-4 py-2 text-sm font-semibold text-mist-300 transition hover:border-pulse-500 hover:text-mist-100 active:translate-y-px"
            >
              ← Back to home
            </Link>
          </div>
        </div>

        <section className="ep-rise ep-rise-3 mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="recorded runs"
            value={String(rows.length)}
          />
          <MetricCard
            label="best accuracy"
            value={best ? percent(best.accuracy) : 'No data'}
          />
          <MetricCard
            label="best macro F1"
            value={best ? percent(best.macroF1) : 'No data'}
          />
          <MetricCard
            label="fastest P95"
            value={
              rows.length > 0
                ? milliseconds(
                    Math.min(...rows.map((row) => row.p95LatencyMs))
                  )
                : 'No data'
            }
          />
        </section>

        <section className="ep-rise ep-rise-4 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
          <div className="border-b border-ink-700 px-6 py-5">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Reference measurements
            </h2>
            <p className="mt-1 text-sm text-mist-400">
              The measurements committed with this project — not a log of
              visitor activity. Controlled rows prove the integration path;
              live rows were produced by authenticated provider execution and
              are versioned in the repository so a reviewer can read them
              without running anything. Runs you start below stay in your own
              browser and never appear here.
            </p>
            <p className="mt-2 text-sm text-mist-400">
              <strong>Passing requires all four:</strong> accuracy ≥ 80%, macro
              F1 ≥ 0.75, invalid output ≤ 5%, and ≥ 95% of requests answered. A
              row marked failed did not clear one of them — the reference
              llava run is kept precisely because it fails.
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-14 text-center text-mist-400">
              No reference measurements are committed yet. Generate one with
              npm run vision:run:ollama -- --model=&lt;tag&gt;, or run the dataset
              below to measure a model without committing anything.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="ep-mono bg-ink-950/70 text-[11px] uppercase tracking-wider text-mist-500">
                  <tr>
                    <TableHeading>Provider</TableHeading>
                    <TableHeading>Mode</TableHeading>
                    <TableHeading>Samples</TableHeading>
                    <TableHeading>Accuracy</TableHeading>
                    <TableHeading>Macro F1</TableHeading>
                    <TableHeading>Success</TableHeading>
                    <TableHeading>Invalid</TableHeading>
                    <TableHeading>Median</TableHeading>
                    <TableHeading>P95</TableHeading>
                    <TableHeading>Throughput</TableHeading>
                    <TableHeading>Gate</TableHeading>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {rows.map((row) => (
                    <tr
                      key={`${row.provider}-${row.model}-${row.completedAt}`}
                      className="transition hover:bg-ink-800/50"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 font-semibold text-mist-100">
                          <ProviderLogo
                            provider={row.provider.split('-')[0]}
                            size={16}
                          />
                          {row.provider}
                        </div>
                        <div className="ep-mono mt-1 text-xs text-mist-600">
                          {row.model}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="ep-mono rounded-md border border-ink-600 bg-ink-950 px-2.5 py-1 text-xs text-mist-300">
                          {row.providerKind} · {row.executionMode}
                        </span>
                      </td>
                      <TableValue>{row.sampleCount}</TableValue>
                      <TableValue>{percent(row.accuracy)}</TableValue>
                      <TableValue>{percent(row.macroF1)}</TableValue>
                      <TableValue>
                        {percent(row.successfulRequestRate)}
                      </TableValue>
                      <TableValue>
                        {percent(row.invalidOutputRate)}
                      </TableValue>
                      <TableValue>
                        {milliseconds(row.medianLatencyMs)}
                      </TableValue>
                      <TableValue>
                        {milliseconds(row.p95LatencyMs)}
                      </TableValue>
                      <TableValue>
                        {row.throughputSamplesPerSecond.toFixed(2)}/s
                      </TableValue>
                      <td className="px-5 py-4">
                        <span
                          className={
                            row.passed
                              ? 'rounded-md border border-good-400/40 bg-good-400/10 px-2.5 py-1 text-xs font-semibold text-good-400'
                              : 'rounded-md border border-bad-400/40 bg-bad-400/10 px-2.5 py-1 text-xs font-semibold text-bad-400'
                          }
                        >
                          {row.passed ? 'Pass' : 'Fail'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/*
          Straight down the page: what has already been measured, then the
          control that measures the shipped dataset, then the one that
          measures images you bring. Each full width - side by side made both
          of them cramped and buried neither.
        */}
        <section className="epd epd-embedded mt-8">
          <RunBuiltInDataset />
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          <Guardrail
            title="Reproducible dataset"
            text="Every fixture is generated locally and verified against its manifest SHA-256."
          />
          <Guardrail
            title="Privacy checked"
            text="The manifest prohibits people, faces, personal data, location metadata, and EXIF."
          />
          <Guardrail
            title="Honest evidence"
            text="Controlled transport results and live provider measurements are labeled separately."
          />
        </section>

        {/*
          Your own images never reach this server - they are read, resized,
          hashed and classified in the visitor's own browser against their own
          Ollama. See DatasetUpload for why that is a requirement rather than
          a convenience.
        */}
        <section className="epd epd-embedded mt-8">
          <DatasetUpload host="http://localhost:11434" />
        </section>


      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ep-panel p-5">
      <p className="ep-mono text-[11px] uppercase tracking-wider text-mist-500">
        {label}
      </p>
      <p className="ep-mono mt-2 text-2xl font-medium text-mist-100">{value}</p>
    </div>
  );
}

function TableHeading({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-medium">{children}</th>;
}

function TableValue({ children }: { children: React.ReactNode }) {
  return (
    <td className="ep-mono whitespace-nowrap px-5 py-4 text-mist-300">
      {children}
    </td>
  );
}

function Guardrail({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/60 p-5">
      <h3 className="font-display font-semibold text-pulse-300">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-mist-400">{text}</p>
    </div>
  );
}
