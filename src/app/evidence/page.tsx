import fs from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';

import { ArcadeNavLinks } from '@/components/ArcadeNav';
import { PaletteToggle } from '@/components/PaletteToggle';
import { ThemeToggle } from '@/components/ThemeToggle';

import './../dashboard/dashboard.css';

/**
 * Every artefact this project produces, in one place.
 *
 * WHY IT EXISTS. Three evidence directories were being written and only one
 * of them was reachable from the application: a reviewer had to know the
 * repository layout to find the failure-mode matrix or the ten-case
 * evaluation. Evidence nobody can reach is evidence nobody checks.
 *
 * WHAT IT DELIBERATELY LEADS WITH. Each artefact already carries
 * `what_this_proves` and `what_this_does_not_prove`, written by whoever
 * generated it. Those come first here, above any number, because the most
 * common way a benchmark misleads is not a wrong figure - it is a correct
 * figure read as answering a question it never asked. A scripted failure
 * matrix and a measured run look alike in a table and mean entirely
 * different things.
 */

export const dynamic = 'force-dynamic';

interface Artefact {
  file: string;
  artefact: string;
  generatedBy: string | null;
  proves: string | null;
  doesNotProve: string | null;
  facts: Array<{ label: string; value: string }>;
  ok: boolean | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function summarise(file: string, doc: Record<string, unknown>): Artefact {
  const facts: Array<{ label: string; value: string }> = [];
  let ok: boolean | null = null;

  // ---- ten-case evaluation matrix ----------------------------------------
  const cases = Array.isArray(doc.cases) ? doc.cases : null;

  if (cases) {
    const passed = cases.filter(
      (entry) => (entry as { passed?: boolean }).passed
    ).length;

    ok = passed === cases.length;
    facts.push({ label: 'Cases', value: `${passed}/${cases.length} behaved as documented` });

    const byCategory = doc.cases_by_category as Record<string, number> | undefined;

    if (byCategory) {
      facts.push({
        label: 'Categories',
        value: Object.entries(byCategory)
          .map(([name, count]) => `${name} ${count}`)
          .join(' · '),
      });
    }
  }

  // ---- failure-mode matrix -----------------------------------------------
  if (typeof doc.all_scenarios_behaved_as_documented === 'boolean') {
    ok = doc.all_scenarios_behaved_as_documented;

    const codes = Array.isArray(doc.error_code_reference)
      ? doc.error_code_reference.length
      : null;

    if (codes !== null) {
      facts.push({ label: 'Error codes exercised', value: String(codes) });
    }

    const harness = doc.harness as { transport?: string } | undefined;

    if (harness?.transport) {
      facts.push({ label: 'Transport', value: harness.transport });
    }
  }

  // ---- a measured run -----------------------------------------------------
  const summary = doc.summary as Record<string, unknown> | undefined;

  if (summary) {
    const mean = num(summary.latency_ms_mean);
    const succeeded = num(summary.iterations_succeeded);
    const run = num(summary.iterations_run);
    const tps = num(summary.tokens_per_second_mean);

    if (succeeded !== null && run !== null) {
      facts.push({ label: 'Iterations', value: `${succeeded}/${run} succeeded` });
    }
    if (mean !== null) {
      facts.push({ label: 'Mean latency', value: `${mean.toFixed(1)} ms` });
    }
    if (tps !== null) {
      facts.push({ label: 'Throughput', value: `${tps.toFixed(1)} tok/s` });
    }
    if (doc.simulated === true) {
      facts.push({ label: 'Simulated', value: 'yes — not a measurement' });
      ok = false;
    }
  }

  return {
    file,
    artefact: str(doc.artefact) ?? file,
    generatedBy: str(doc.generated_by),
    proves: str(doc.what_this_proves),
    doesNotProve: str(doc.what_this_does_not_prove),
    facts,
    ok,
  };
}

/**
 * Reads one directory of artefacts.
 *
 * The directory arrives as LITERAL path segments from the caller rather than
 * from an array this function loops over. That is not style. Turbopack traces
 * which files a server component touches, and a path it cannot resolve
 * statically makes it trace the whole project into the standalone output -
 * exactly what `output: 'standalone'` exists to prevent. The production build
 * said so out loud: "Encountered unexpected file in NFT list ... the whole
 * project was traced unintentionally", pointing at this file.
 */
async function readArtefactDirectory(
  root: string,
  directory: string
): Promise<Artefact[]> {
  const found: Artefact[] = [];

  let entries: string[];

  try {
    entries = await fs.readdir(directory);
  } catch {
    return found; // a directory that does not exist yet is not an error
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;

    try {
      const raw = await fs.readFile(path.join(directory, entry), 'utf8');
      found.push(
        summarise(`${root}/${entry}`, JSON.parse(raw) as Record<string, unknown>)
      );
    } catch {
      found.push({
        file: `${root}/${entry}`,
        artefact: entry,
        generatedBy: null,
        proves: null,
        doesNotProve:
          'This file could not be parsed, so nothing in it can be relied on.',
        facts: [],
        ok: false,
      });
    }
  }

  return found;
}

async function loadArtefacts(): Promise<Artefact[]> {
  // Two explicit calls with literal segments, for the tracing reason above.
  const [benchmark, evaluation] = await Promise.all([
    readArtefactDirectory(
      'evidence/benchmark',
      path.join(process.cwd(), 'evidence', 'benchmark')
    ),
    readArtefactDirectory(
      'evidence/evaluation',
      path.join(process.cwd(), 'evidence', 'evaluation')
    ),
  ]);

  return [...benchmark, ...evaluation].sort((a, b) =>
    a.file.localeCompare(b.file)
  );
}

export default async function EvidencePage() {
  const artefacts = await loadArtefacts();

  return (
    <div className="epd">
      <header className="epd-header">
        <div className="epd-brand">
          Edge<span>Pilot</span> · Evidence
        </div>
        <div className="epd-tagline">
          what each artefact proves, and what it does not
          {' · '}
          <ArcadeNavLinks
            items={[
              { href: '/', label: 'home' },
              { href: '/dashboard', label: 'dashboard' },
              { href: '/compare', label: 'compare' },
              { href: '/history', label: 'history' },
            ]}
          />
        </div>
        <PaletteToggle
          className="btn"
          style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}
        />
        <ThemeToggle
          className="btn"
          style={{ padding: '4px 10px', fontSize: 12 }}
        />
      </header>

      <main className="epd-main">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Why this page reads the way it does</h2>
          <p className="card-sub">
            Every artefact below states its own limits before its numbers. A
            scripted failure matrix and a measured benchmark run look alike in
            a table and mean entirely different things — the most common way a
            benchmark misleads is a correct figure read as answering a question
            it never asked.
          </p>
          <p className="card-sub">
            Vision results have their own page:{' '}
            <Link href="/vision-benchmark">vision benchmark comparison</Link>.
            Live runs and controlled fixtures are labelled separately there.
          </p>
          <p className="card-sub" style={{ marginBottom: 0 }}>
            The ten-case matrix below is summarised as a pass count. Each case,
            with the request that produced it and the behaviour observed, is on
            the <Link href="/evaluation">evaluation matrix page</Link> — including
            the three prompt-injection cases.
          </p>
        </section>

        {artefacts.length === 0 ? (
          <section className="card">
            <p className="card-sub">
              No artefacts yet. Generate them with{' '}
              <code>npm run eval:matrix</code>,{' '}
              <code>npm run bench:evidence:failures</code> and{' '}
              <code>npm run bench:run</code>.
            </p>
          </section>
        ) : null}

        {artefacts.map((artefact) => (
          <section className="card" key={artefact.file}>
            <h2 style={{ marginTop: 0 }}>
              {artefact.artefact}{' '}
              {artefact.ok === true ? (
                <span style={{ fontSize: 13, color: 'var(--status-good)' }}>
                  · as documented
                </span>
              ) : artefact.ok === false ? (
                <span style={{ fontSize: 13, color: 'var(--status-serious)' }}>
                  · discrepancies present
                </span>
              ) : null}
            </h2>
            <p className="card-sub">
              <code>{artefact.file}</code>
              {artefact.generatedBy ? (
                <>
                  {' '}
                  · regenerate with <code>{artefact.generatedBy}</code>
                </>
              ) : null}
            </p>

            {artefact.proves ? (
              <div className="callout callout-ok" role="note">
                <strong>What this proves.</strong> {artefact.proves}
              </div>
            ) : null}

            {artefact.doesNotProve ? (
              <div className="callout callout-warn" role="note">
                <strong>What this does not prove.</strong> {artefact.doesNotProve}
              </div>
            ) : null}

            {artefact.facts.length > 0 ? (
              <ul className="list">
                {artefact.facts.map((fact) => (
                  <li key={fact.label}>
                    <strong>{fact.label}:</strong> {fact.value}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </main>
    </div>
  );
}
