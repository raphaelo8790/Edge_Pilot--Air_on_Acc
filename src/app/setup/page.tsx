import type { Metadata } from 'next';

import { ArcadeNavLinks } from '@/components/ArcadeNav';
import { PaletteToggle } from '@/components/PaletteToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SetupGuide } from '@/components/setup/SetupGuide';

import './../dashboard/dashboard.css';

export const metadata: Metadata = {
  title: 'Set up — EdgePilot',
  description:
    'Let this site talk to the Ollama on your computer, and use your own Gemini and Groq keys.',
};

/** /setup — module owner: Kareem Ehab (Product UI & Benchmark Dashboard). */
export default function SetupPage() {
  return (
    <div className="epd">
      <header className="epd-header">
        <div className="epd-brand">
          Edge<span>Pilot</span> · Setup
        </div>
        <div className="epd-tagline">
          your computer, your keys — two minutes, once
          {' · '}
          <ArcadeNavLinks
            items={[
              { href: '/', label: 'Home' },
              { href: '/dashboard', label: 'Dashboard' },
              { href: '/compare', label: 'Compare' },
              { href: '/vision-benchmark', label: 'Vision' },
              { href: '/history', label: 'Session history' },
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
        <SetupGuide />
      </main>
    </div>
  );
}
