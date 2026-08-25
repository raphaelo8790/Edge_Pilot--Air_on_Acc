import fs from 'node:fs/promises';
import path from 'node:path';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ArcadeNavLinks } from '@/components/ArcadeNav';
import { PaletteToggle } from '@/components/PaletteToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CATEGORY_BLURB, CATEGORY_LABEL, CATEGORY_ORDER } from './categories';
import '../dashboard/dashboard.css';

/**
 * The ten-case evaluation matrix, on the site.
 *
 * The matrix already existed as a generated artefact and was reachable only
 * as a single summary line on /evidence ("10/10 behaved as documented"). A
 * pass count is the least interesting thing about it: the point of the matrix
 * is WHICH conditions were exercised and what each one actually produced —
 * particularly the injection cases, where the interesting part is that a
 * prompt telling the system to fake a score changes nothing.
 *
 * Every field rendered here comes from the artefact. Nothing is restated or
 * summarised by hand, so regenerating the file updates the page and a case
 * that starts failing shows as failing.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Evaluation matrix',
  description:
    'Ten documented behaviours — normal, malformed, ambiguous, prompt-injection, missing-evidence and provider-failure — each with what was sent and what was observed.',
};

interface MatrixCase {
  id: number;
  category: string;
  name: string;
  sent: unknown;
  expected: string;
  observed: unknown;
  passed: boolean;
}

interface Matrix {
  artefact: string;
  generated_by: string;
  what_this_proves: string;
  what_this_does_not_prove: string;
  injection_threat_model: string;
  case_count: number;
  cases_by_category: Record<string, number>;
  all_cases_behaved_as_documented: boolean;
  failed_case_ids: number[];
  cases: MatrixCase[];
}

/**
 * Literal path segments, deliberately. Turbopack traces which files a server
 * component touches, and a path it cannot resolve statically makes it trace
 * the whole project into the standalone output — the same reason the evidence
 * page spells its directories out.
 */
async function loadMatrix(): Promise<Matrix | null> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), 'evidence', 'evaluation', 'ten-case-matrix.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw) as Matrix;
    return Array.isArray(parsed.cases) ? parsed : null;
  } catch {
    return null;
  }
}

function CodeBlock({ value }: { value: unknown }) {
  return <pre className="code-block">{JSON.stringify(value, null, 2)}</pre>;
}

export default async function EvaluationPage() {
  const matrix = await loadMatrix();

  return (
    <div className="epd">
      <header className="epd-header">
        <div className="epd-brand">
          Edge<span>Pilot</span> · Evaluation matrix
        </div>
        <div className="epd-tagline">
          ten documented behaviours, each with what was sent and what came back
          {' · '}
          <ArcadeNavLinks
            items={[
              { href: '/', label: 'home' },
              { href: '/evidence', label: 'evidence' },
              { href: '/dashboard', label: 'dashboard' },
            ]}
          />
        </div>
        <PaletteToggle
          className="btn"
          style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}
        />
        <ThemeToggle className="btn" style={{ padding: '4px 10px', fontSize: 12 }} />
      </header>

      <main className="epd-main">
        {matrix === null ? (
          <section className="card">
            <h2 style={{ marginTop: 0 }}>No matrix recorded yet</h2>
            <p className="card-sub">
              Generate it with <code>npm run eval:matrix</code>, then reload.
              The page reads{' '}
              <code>evidence/evaluation/ten-case-matrix.json</code> directly, so
              nothing here is written by hand.
            </p>
          </section>
        ) : (
          <>
            <section className="card">
              <h2 style={{ marginTop: 0 }}>{matrix.artefact}</h2>
              <p className="card-sub">
                <code>evidence/evaluation/ten-case-matrix.json</code> · regenerate
                with <code>{matrix.generated_by}</code>
              </p>

              <div className="callout callout-ok" role="note">
                <strong>What this proves.</strong> {matrix.what_this_proves}
              </div>
              <div className="callout callout-warn" role="note">
                <strong>What this does not prove.</strong>{' '}
                {matrix.what_this_does_not_prove}
              </div>

              <div className="stat-row">
                <div className="stat">
                  <p className="stat-label">Cases</p>
                  <p className="stat-value">{matrix.case_count}</p>
                  <p className="stat-sub">across {CATEGORY_ORDER.length} categories</p>
                </div>
                <div className="stat">
                  <p className="stat-label">Behaved as documented</p>
                  <p className="stat-value">
                    {matrix.cases.filter((c) => c.passed).length}/{matrix.case_count}
                  </p>
                  <p className="stat-sub">
                    {matrix.all_cases_behaved_as_documented
                      ? 'no discrepancies'
                      : `failed: ${matrix.failed_case_ids.join(', ')}`}
                  </p>
                </div>
                <div className="stat">
                  <p className="stat-label">Injection cases</p>
                  <p className="stat-value">
                    {matrix.cases_by_category.injection ?? 0}
                  </p>
                  <p className="stat-sub">output matched, never obeyed</p>
                </div>
                <div className="stat">
                  <p className="stat-label">Models called</p>
                  <p className="stat-value">0</p>
                  <p className="stat-sub">no network request is made</p>
                </div>
              </div>

              <h3>Injection threat model</h3>
              <p className="card-sub" style={{ marginBottom: 0 }}>
                {matrix.injection_threat_model}
              </p>
            </section>

            {CATEGORY_ORDER.map((category) => {
              const cases = matrix.cases.filter((c) => c.category === category);
              if (cases.length === 0) return null;

              return (
                <section className="card" key={category}>
                  <h2 style={{ marginTop: 0 }}>
                    {CATEGORY_LABEL[category] ?? category}{' '}
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      · {cases.length} case{cases.length > 1 ? 's' : ''}
                    </span>
                  </h2>
                  <p className="card-sub">{CATEGORY_BLURB[category] ?? ''}</p>

                  {cases.map((entry) => (
                    <article className="matrix-case" key={entry.id}>
                      <div className="matrix-case-head">
                        <span className="matrix-case-id">
                          {String(entry.id).padStart(2, '0')}
                        </span>
                        <h3 style={{ margin: 0, fontSize: 14.5 }}>{entry.name}</h3>
                        <span
                          className={`badge ${entry.passed ? 'badge-measured' : 'badge-failed'}`}
                        >
                          {entry.passed ? '✓ as documented' : '✕ discrepancy'}
                        </span>
                      </div>

                      <p className="matrix-expected">
                        <strong>Expected.</strong> {entry.expected}
                      </p>

                      <div className="matrix-io">
                        <details>
                          <summary>What was sent</summary>
                          <CodeBlock value={entry.sent} />
                        </details>
                        <details>
                          <summary>What was observed</summary>
                          <CodeBlock value={entry.observed} />
                        </details>
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}

            <section className="card">
              <h2 style={{ marginTop: 0 }}>Where the measured numbers live</h2>
              <p className="card-sub" style={{ marginBottom: 0 }}>
                Nothing on this page is a performance measurement — no model is
                called and no network request is made. Latency, throughput and
                accuracy live in the{' '}
                <Link href="/evidence">evidence ledger</Link> and the{' '}
                <Link href="/vision-benchmark">vision benchmark</Link>.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
