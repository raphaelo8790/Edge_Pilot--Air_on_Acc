import type { Metadata } from 'next';
import {
  Instrument_Sans,
  JetBrains_Mono,
  Press_Start_2P,
  Space_Grotesk,
} from 'next/font/google';
import './globals.css';

const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
});

const grotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-grotesk',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

/** Used by the arcade palette, and only for the wordmark. */
const pixel = Press_Start_2P({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-pixel',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'EdgePilot AI — measured local vs cloud AI deployment',
    template: '%s · EdgePilot AI',
  },
  description:
    'Decide whether a workload should run locally, in the cloud, or not at all on a device — from recorded benchmarks, not guesses.',
  openGraph: {
    title: 'EdgePilot AI',
    description:
      'Compare local and cloud AI deployment with real benchmarks: latency, throughput, hardware fit, privacy, cost.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${grotesk.variable} ${jetbrains.variable} ${pixel.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme and palette before first paint. Dark and
            cockpit are the defaults, so only the non-default values need to
            touch the DOM — and a broken localStorage (private browsing)
            silently keeps the defaults. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var d=document.documentElement;if(localStorage.getItem('edgepilot.theme')==='light'){d.setAttribute('data-theme','light')}if(localStorage.getItem('edgepilot.palette')==='arcade'){d.setAttribute('data-palette','arcade')}}catch(e){}",
          }}
        />
      </head>
      <body className="ep-grain">{children}</body>
    </html>
  );
}
