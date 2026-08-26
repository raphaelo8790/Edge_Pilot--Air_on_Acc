import type { Metadata } from 'next';

import { ArcadeNavLinks } from '@/components/ArcadeNav';
import { PaletteToggle } from '@/components/PaletteToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SessionHistory } from '@/components/history/SessionHistory';

import './../dashboard/dashboard.css';

export const metadata: Metadata = {
  title: 'Session history — EdgePilot',
  description:
    'Every benchmark run and activity record from this session, with explicit control over what is downloaded and what is shared.',
};

/**
 * The route, its chrome, and the shared header. The history itself lives in
 * the visitor's browser, so the work is in the client component below.
 *
 * The header is the same one every other page carries — this page is a
 * destination people arrive at from a run, and it needs a way back out.
 */
export default function HistoryPage() {
  return (
    <div className="epd">
      <header className="epd-header">
        <div className="epd-brand">
          Edge<span>Pilot</span> · History
        </div>
        <div className="epd-tagline">
          everything this session produced, and where it goes
          {' · '}
          <ArcadeNavLinks
            items={[
              { href: '/', label: 'home' },
              { href: '/dashboard', label: 'dashboard' },
              { href: '/compare', label: 'compare' },
              { href: '/vision-benchmark', label: 'vision' },
              { href: '/evidence', label: 'evidence' },
              { href: '/evaluation', label: 'evaluation' },
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
        <SessionHistory />
      </main>
    </div>
  );
}
