import path from 'node:path';
import Link from 'next/link';
import {
  rankVisionDashboardRows,
  toVisionDashboardRow,
} from '@/modules/vision-benchmark/application/dashboard';
import { VisionDashboardRow } from '@/modules/vision-benchmark/core/types';
import { FileVisionEvidenceStore } from '@/modules/vision-benchmark/infrastructure/evidence-store';
import { DatasetUpload } from '@/components/vision/DatasetUpload';

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
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-400">
              EdgePilot AI
            </p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Vision benchmark comparison
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              Compare local and cloud component-recognition runs using
              deterministic metrics, validated evidence, and the same
              21-image workload.
            </p>
          </div>
          <Link
            href="/"
            className="w-fit rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
          >
            Back to home
          </Link>
        </div>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Recorded runs"
            value={String(rows.length)}
          />
          <MetricCard
            label="Best accuracy"
            value={best ? percent(best.accuracy) : 'No data'}
          />
          <MetricCard
            label="Best macro F1"
            value={best ? percent(best.macroF1) : 'No data'}
          />
          <MetricCard
            label="Fastest P95"
            value={
              rows.length > 0
                ? milliseconds(
                    Math.min(...rows.map((row) => row.p95LatencyMs))
                  )
                : 'No data'
            }
          />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-cyan-950/20">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Provider evidence
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Controlled rows prove the integration path; live rows are
              created only by authenticated provider execution.
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-14 text-center text-slate-400">
              No validated evidence files are available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-950/70 text-xs uppercase tracking-wider text-slate-400">
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
                <tbody className="divide-y divide-slate-800">
                  {rows.map((row) => (
                    <tr
                      key={`${row.provider}-${row.model}-${row.completedAt}`}
                      className="transition hover:bg-slate-800/50"
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-100">
                          {row.provider}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.model}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-300">
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
                              ? 'rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300'
                              : 'rounded-full bg-rose-400/10 px-2.5 py-1 text-xs font-semibold text-rose-300'
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
          Client component. The images never reach this server - they are read,
          resized, hashed and classified in the visitor's own browser against
          their own Ollama. See DatasetUpload for why that is a requirement
          rather than a convenience.
        */}
        <section className="epd mt-10">
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
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function TableHeading({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-semibold">{children}</th>;
}

function TableValue({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-200">
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
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <h3 className="font-semibold text-cyan-300">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}
