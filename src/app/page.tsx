import Link from 'next/link';

import { OllamaMark } from '@/components/dashboard/ProviderLogo';
import { ArcadeNavLinks } from '@/components/ArcadeNav';
import { BrandMark } from '@/components/BrandMark';
import { PaletteToggle } from '@/components/PaletteToggle';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Landing page. Every number shown here is copied from a real artefact in
 * /evidence — the page must obey the same rule as the product: no invented
 * figures. If the evidence changes, update the readout by hand.
 */

const measuredRun = {
  provider: 'ollama',
  model: 'llama3.2:latest',
  rows: [
    { label: 'time to first token', value: '1305.3', unit: 'ms', pct: 46 },
    { label: 'p50 latency', value: '1542.1', unit: 'ms', pct: 54 },
    { label: 'throughput', value: '91.3', unit: 'tok/s', pct: 78 },
    { label: 'iterations succeeded', value: '5/5', unit: '100%', pct: 100 },
  ],
};

const dimensions = [
  {
    name: 'Hardware fit',
    detail: 'Will the model actually be resident on this device — VRAM, RAM, storage — or silently spill?',
  },
  {
    name: 'Latency',
    detail: 'Time to first token and full-response time, streamed and measured, never inferred from token math.',
  },
  {
    name: 'Privacy',
    detail: 'Whether the prompt leaves the machine at all, with a blocking confirmation before any egress.',
  },
  {
    name: 'Cost',
    detail: 'What the same workload costs per thousand requests on each provider, from recorded pricing.',
  },
  {
    name: 'Reliability',
    detail: 'Success rate across iterations, with eight documented failure codes instead of a generic error.',
  },
];

const destinations = [
  {
    href: '/dashboard',
    title: 'Benchmark dashboard',
    body: 'Describe a workload, pick providers, run controlled text-generation benchmarks and read the readiness verdict.',
    tag: 'workload → run → readiness',
  },
  {
    href: '/compare',
    title: 'Model comparison',
    body: 'Run 2–4 models head-to-head on one prompt. Eight dimensions, each verdict marked established, too close, or plain variance.',
    tag: 'honest verdicts, no forced winner',
  },
  {
    href: '/vision-benchmark',
    title: 'Vision benchmark',
    body: 'A bounded 21-image classification workload with manifest-verified fixtures, run against local and cloud vision models.',
    tag: '21 images · 48 automated cases',
  },
  {
    href: '/evidence',
    title: 'Evidence ledger',
    body: 'Every artefact the project produces, each stating what it proves — and what it deliberately does not.',
    tag: 'provenance on every number',
  },
];

function Wordmark() {
  return (
    <span className="ep-wordmark font-display text-lg font-semibold tracking-tight text-mist-100">
      Edge<span className="text-pulse-400">Pilot</span>
    </span>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh bg-ink-950 text-mist-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-pulse-500 focus:px-4 focus:py-2 focus:text-pulse-ink"
      >
        Skip to content
      </a>

      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-ink-700/70 bg-ink-950/80 backdrop-blur-md">
        <nav
          aria-label="Primary"
          className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5"
        >
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark className="h-6 w-6" />
            <Wordmark />
          </Link>
          {/* In the arcade palette these become coins, and a bit plays before
              the route changes — Pac-Man eats pellets in dark, Mario chases a
              mushroom in light. In cockpit they are plain links. See
              ArcadeNav. */}
          <div className="hidden items-center gap-1 sm:flex">
            <ArcadeNavLinks
              items={[
                { href: '/dashboard', label: 'Dashboard' },
                { href: '/compare', label: 'Compare' },
                { href: '/vision-benchmark', label: 'Vision' },
                { href: '/evidence', label: 'Evidence' },
                { href: '/history', label: 'History' },
                { href: '/evaluation', label: 'Matrix' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <PaletteToggle className="hidden rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-mist-400 transition hover:border-pulse-500 hover:text-mist-100 sm:block" />
            <ThemeToggle className="rounded-lg border border-ink-600 px-2.5 py-1.5 text-sm text-mist-400 transition hover:border-pulse-500 hover:text-mist-100" />
            <Link
              href="/dashboard"
              className="rounded-lg bg-pulse-500 px-3.5 py-1.5 text-sm font-semibold text-pulse-ink transition hover:bg-pulse-400 active:translate-y-px"
            >
              Run a benchmark
            </Link>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* hero */}
        <section className="ep-grid-bg relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 pb-24 pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-28">
            <div>
              <p className="ep-label ep-rise">
                local · cloud · or not at all
              </p>
              <h1 className="ep-rise ep-rise-1 mt-5 max-w-xl font-display text-5xl font-semibold leading-[1.04] tracking-tight text-balance sm:text-6xl">
                Decide where your AI runs.{' '}
                <span className="text-pulse-300">Measure first.</span>
              </h1>
              <p className="ep-rise ep-rise-2 mt-6 max-w-lg text-lg leading-relaxed text-mist-400">
                A model feels fine in a demo — then latency spikes on real
                hardware, the cloud bill surprises you, or private data leaves
                a device it never should have. EdgePilot turns the deployment
                question into recorded benchmarks and a readiness verdict you
                can defend.
              </p>
              <div className="ep-rise ep-rise-3 mt-9 flex flex-wrap items-center gap-4">
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-pulse-500 px-5 py-2.5 font-semibold text-pulse-ink shadow-[0_10px_30px_-10px] shadow-pulse-600/60 transition hover:bg-pulse-400 active:translate-y-px"
                >
                  Open the dashboard
                </Link>
                <Link
                  href="/evidence"
                  className="rounded-lg border border-ink-600 px-5 py-2.5 font-semibold text-mist-300 transition hover:border-pulse-500 hover:text-mist-100 active:translate-y-px"
                >
                  Inspect the evidence
                </Link>
                <a
                  href="/api/v1/vision-benchmarks"
                  className="ep-mono text-sm text-mist-500 underline decoration-ink-600 underline-offset-4 transition hover:text-pulse-300"
                >
                  evidence API →
                </a>
              </div>
              <p className="ep-rise ep-rise-4 ep-mono mt-10 text-xs tracking-wide text-mist-600">
                measured or recorded results only — the comparison engine
                refuses estimates
              </p>
            </div>

            {/* instrument readout — real numbers from evidence/benchmark.
                ep-halo: the amber glow behind the panel, as if backlit. */}
            <div className="ep-rise ep-rise-4 ep-halo">
              <div className="ep-panel ep-panel-hover p-6">
                <div className="flex items-center justify-between gap-3 border-b border-ink-700 pb-4">
                  <div className="ep-mono flex items-center gap-2 text-xs text-mist-400">
                    <OllamaMark size={15} />
                    {measuredRun.provider} · {measuredRun.model}
                  </div>
                  <span className="flex items-center gap-1.5 rounded-md border border-good-400/40 bg-good-400/10 px-2 py-0.5 text-[11px] font-semibold text-good-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-good-400" />
                    measured
                  </span>
                </div>
                <dl className="mt-5 space-y-5">
                  {measuredRun.rows.map((row) => (
                    <div key={row.label}>
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="ep-mono text-xs uppercase tracking-wider text-mist-500">
                          {row.label}
                        </dt>
                        <dd className="ep-mono text-lg font-medium text-mist-100">
                          {row.value}
                          <span className="ml-1 text-xs text-mist-500">{row.unit}</span>
                        </dd>
                      </div>
                      <div className="mt-2 h-1 rounded-full bg-ink-700">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-pulse-600 to-pulse-400"
                          style={{ width: `${row.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </dl>
                <p className="ep-mono mt-6 text-[11px] leading-relaxed text-mist-600">
                  5-iteration run, GPU-resident, captured 2026-07-31 on an
                  i7-14700HX — from{' '}
                  <span className="text-mist-500">evidence/benchmark/</span>
                  <span className="ep-cursor text-pulse-400">▌</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* the question */}
        <section className="border-y border-ink-800 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <p className="max-w-3xl font-display text-2xl font-medium leading-snug tracking-tight text-mist-300 sm:text-3xl">
              <span className="text-mist-600">The only question that matters before shipping:</span>{' '}
              should this workload run locally, in the cloud, or not at all on
              this device — <span className="text-pulse-300">and why?</span>
            </p>
          </div>
        </section>

        {/* how it works — numbered rows, not three equal cards */}
        <section className="mx-auto max-w-6xl px-5 py-24">
          <p className="ep-label">how it works</p>
          <h2 className="mt-4 max-w-lg font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            From a hunch to a defensible decision
          </h2>
          <ol className="mt-14 space-y-0">
            {[
              {
                n: '01',
                title: 'Describe the workload',
                body: 'Task type, expected volume, privacy constraints. The wizard captures what you are actually deciding about — not a synthetic benchmark suite.',
              },
              {
                n: '02',
                title: 'Run measured benchmarks',
                body: 'Streaming adapters against local Ollama and the Gemini and Groq APIs. Time to first token is observed, token counts come from provider usage metadata, and every failure maps to a documented error code.',
              },
              {
                n: '03',
                title: 'Read the readiness verdict',
                body: 'Hardware fit, latency, privacy, cost and reliability combine into one deployment-oriented score — with the provenance of every input number one click away.',
              },
            ].map((step, i) => (
              <li
                key={step.n}
                className={`grid gap-4 border-ink-800 py-10 sm:grid-cols-[90px_1fr] lg:grid-cols-[90px_320px_1fr] ${
                  i > 0 ? 'border-t' : ''
                }`}
              >
                <span className="ep-mono text-sm text-pulse-400">{step.n}</span>
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="max-w-prose leading-relaxed text-mist-400">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* readiness dimensions */}
        <section className="border-t border-ink-800 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="ep-label">readiness_score()</p>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Five dimensions, one verdict
                </h2>
                <p className="mt-5 max-w-sm leading-relaxed text-mist-400">
                  The score is deployment-oriented: it answers whether this
                  device can carry this workload, not which model tops a
                  leaderboard.
                </p>
              </div>
              <ul className="space-y-3">
                {dimensions.map((d) => (
                  <li
                    key={d.name}
                    className="group grid gap-1 rounded-xl border border-ink-700/60 bg-ink-950/60 px-5 py-4 transition hover:border-ink-600 sm:grid-cols-[150px_1fr] sm:gap-6"
                  >
                    <span className="font-display font-semibold text-mist-100 transition group-hover:text-pulse-300">
                      {d.name}
                    </span>
                    <span className="text-sm leading-relaxed text-mist-400">
                      {d.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* destinations */}
        <section className="mx-auto max-w-6xl px-5 py-24">
          <p className="ep-label">start here</p>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Three views of the same discipline
          </h2>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {destinations.map((d) => (
              <Link key={d.href} href={d.href} className="ep-panel flex flex-col p-6">
                <span className="ep-mono text-[11px] uppercase tracking-wider text-mist-600">
                  {d.tag}
                </span>
                <h3 className="mt-3 font-display text-xl font-semibold tracking-tight">
                  {d.title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-mist-400">
                  {d.body}
                </p>
                <span className="mt-6 text-sm font-semibold text-pulse-400">
                  Open →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* footer */}
      <footer className="border-t border-ink-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-5 w-5" />
            <Wordmark />
          </div>
          <p className="ep-mono text-xs text-mist-600">
            MIT licensed · benchmarks, not vibes · every number carries its
            provenance
          </p>
          <div className="flex gap-5 text-sm text-mist-500">
            <Link href="/dashboard" className="transition hover:text-mist-100">
              Dashboard
            </Link>
            <Link href="/compare" className="transition hover:text-mist-100">
              Compare
            </Link>
            <Link href="/vision-benchmark" className="transition hover:text-mist-100">
              Vision
            </Link>
            <Link href="/evidence" className="transition hover:text-mist-100">
              Evidence
            </Link>
            <Link href="/evaluation" className="transition hover:text-mist-100">
              Matrix
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

