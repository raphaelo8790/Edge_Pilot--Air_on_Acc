'use client';

/**
 * The two things a visitor does once so the hosted site works with THEIR
 * machine and THEIR accounts: let Ollama accept this site, and (optionally)
 * paste their own cloud keys.
 *
 * WHY A PAGE AND NOT A TOOLTIP. The Ollama step cannot be done by the page
 * itself - it is Ollama's own safety check, refusing any website it was not
 * told to trust - and the instructions differ by operating system. It
 * deserves room, a copy button, and a way to test that it worked.
 *
 * Nothing here is sent anywhere until the visitor presses a button. The
 * keys go to localStorage (apiKeys.ts) and from there ride on this app's own
 * API calls; the "test" buttons make one listing call each.
 */

import { useEffect, useState } from 'react';

import { getProviderModels } from '@/components/dashboard/api';
import {
  readApiKey,
  writeApiKey,
  type CloudKeyProvider,
} from '@/components/dashboard/apiKeys';
import {
  BROWSER_OLLAMA_HOST,
  probeBrowserOllama,
} from '@/modules/benchmark/infrastructure/browser-ollama';
import type { LocalRuntimeDto } from '@/modules/benchmark/application/dtos/LocalRuntime';

type Os = 'windows' | 'macos' | 'linux';

/** localStorage key: a connection check passed in this browser once. */
const PASSED_KEY = 'edgepilot.setup.ollama-connected';

const OS_LABEL: Record<Os, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

/** A best guess from the user agent, so the right tab is open on arrival. */
function detectOs(): Os {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  return 'windows';
}

/**
 * The exact commands, per OS, with this site's real origin filled in. Each
 * sets OLLAMA_ORIGINS persistently and restarts Ollama so it takes effect.
 *
 * `*` would allow every website; the site's own origin is what is shown,
 * because a visitor should not hand their GPU to the whole internet to use
 * one page. The note below says how to widen it if they want to.
 */
function instructions(os: Os, origin: string): { steps: string[]; command: string } {
  switch (os) {
    case 'windows':
      return {
        steps: [
          'Open PowerShell (Start menu, type "powershell").',
          'Paste the command and press Enter. It sets the variable for your account, permanently.',
          'Quit Ollama from the tray icon (bottom-right), then start it again from the Start menu.',
        ],
        command: `[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "${origin}", "User")`,
      };
    case 'macos':
      return {
        steps: [
          'Open Terminal (Spotlight, type "terminal").',
          'Paste the command and press Enter. It sets the variable for your login session.',
          'Quit Ollama from the menu bar, then open it again from Applications.',
        ],
        command: `launchctl setenv OLLAMA_ORIGINS "${origin}"`,
      };
    case 'linux':
      return {
        steps: [
          'If Ollama runs as a service (the default installer does this), paste the block below into a terminal. It adds the variable to the service and restarts it.',
          'If you start Ollama by hand instead, run: OLLAMA_ORIGINS="' + origin + '" ollama serve',
        ],
        command:
          `sudo mkdir -p /etc/systemd/system/ollama.service.d\n` +
          `printf '[Service]\\nEnvironment="OLLAMA_ORIGINS=${origin}"\\n' | sudo tee /etc/systemd/system/ollama.service.d/origins.conf\n` +
          `sudo systemctl daemon-reload && sudo systemctl restart ollama`,
      };
  }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked - the text is still selectable */
        }
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function OllamaSection() {
  const [os, setOs] = useState<Os>('windows');
  const [origin, setOrigin] = useState('this site');
  const [probe, setProbe] = useState<LocalRuntimeDto | null>(null);
  const [checking, setChecking] = useState(false);
  // Remembered per browser once a check has passed, so a returning visitor
  // is told "already done" rather than walked through the steps again.
  const [passedBefore, setPassedBefore] = useState(false);

  // Both read browser-only values, so they are set after mount, in a
  // callback, rather than during render.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setOs(detectOs());
      setOrigin(window.location.origin);
      try {
        setPassedBefore(window.localStorage.getItem(PASSED_KEY) === 'true');
      } catch {
        /* storage blocked - just show the steps */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const isLocalPage =
    origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  const how = instructions(os, origin);

  async function check() {
    setChecking(true);
    const result = await probeBrowserOllama();
    setProbe(result);
    setChecking(false);
    setPassedBefore(result.ok);
    try {
      if (result.ok) window.localStorage.setItem(PASSED_KEY, 'true');
      else window.localStorage.removeItem(PASSED_KEY);
    } catch {
      /* storage blocked */
    }
  }

  return (
    <section className="card">
      <h2>1 · Let this site talk to your Ollama</h2>
      <p className="card-sub">
        Local benchmarks run on <em>your</em> computer: this page sends the
        requests straight to the Ollama at <code>{BROWSER_OLLAMA_HOST}</code>{' '}
        and nothing about your machine goes to our server except the timings.
        Ollama, sensibly, refuses websites it has not been told to trust — so
        once, you tell it to trust this one.
      </p>

      {isLocalPage ? (
        <div className="callout" role="status">
          You are running EdgePilot on your own machine, and Ollama trusts
          localhost by default. Nothing to do here — press the button below to
          confirm.
        </div>
      ) : passedBefore && probe === null ? (
        <div className="callout" role="status">
          This browser has connected to your Ollama before. If it is running,
          there is nothing to redo — press the button below to confirm, or
          follow the steps again if it has stopped working.
        </div>
      ) : null}

      <div className="btn-row" role="tablist" aria-label="Operating system">
        {(['windows', 'macos', 'linux'] as Os[]).map((choice) => (
          <button
            key={choice}
            type="button"
            role="tab"
            aria-selected={os === choice}
            className={os === choice ? 'btn btn-primary' : 'btn'}
            onClick={() => setOs(choice)}
          >
            {OS_LABEL[choice]}
          </button>
        ))}
      </div>

      <ol className="setup-steps">
        {how.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="setup-command">
        <pre>
          <code>{how.command}</code>
        </pre>
        <CopyButton text={how.command} />
      </div>

      <p className="hint">
        Prefer to allow every website? Use <code>*</code> instead of{' '}
        <code>{origin}</code>. Any page you open could then use your Ollama,
        which is why the site&apos;s own address is what is shown.
      </p>

      <div className="btn-row">
        <button type="button" className="btn btn-primary" disabled={checking} onClick={check}>
          {checking ? 'Checking…' : 'Check the connection'}
        </button>
      </div>

      {probe ? (
        <div className={probe.ok ? 'callout' : 'error-text'} role="status" aria-live="polite">
          {probe.ok
            ? `Connected. Ollama ${probe.version ?? ''} answered with ${probe.model_count} model${probe.model_count === 1 ? '' : 's'} installed.`
            : `${probe.message} ${probe.remedy ?? ''}`}
        </div>
      ) : null}
    </section>
  );
}

function KeyField({
  provider,
  label,
  consoleUrl,
}: {
  provider: CloudKeyProvider;
  label: string;
  consoleUrl: string;
}) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const existing = readApiKey(provider);
      setValue(existing);
      setSaved(existing !== '');
    });
    return () => cancelAnimationFrame(frame);
  }, [provider]);

  function save() {
    writeApiKey(provider, value);
    setSaved(value.trim() !== '');
    setVerdict(null);
  }

  async function test() {
    save();
    setTesting(true);
    const res = await getProviderModels(provider);
    setTesting(false);
    setVerdict(
      res.ok
        ? res.data.ok
          ? `Works — ${res.data.message}`
          : `${res.data.message} ${res.data.remedy ?? ''}`
        : `Could not check: ${res.error}`
    );
  }

  return (
    <div className="field">
      <label htmlFor={`key-${provider}`}>
        {label} API key{' '}
        {saved ? <span className="badge badge-measured">saved in this browser</span> : null}
      </label>
      <p className="hint">
        Get one at{' '}
        <a href={consoleUrl} target="_blank" rel="noreferrer">
          {consoleUrl.replace(/^https?:\/\//, '')}
        </a>
        . Leave empty to use the site&apos;s own key, if the operator set one.
      </p>
      <div className="setup-key-row">
        <input
          id={`key-${provider}`}
          type={reveal ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="paste your key"
        />
        <button type="button" className="btn" onClick={() => setReveal((r) => !r)}>
          {reveal ? 'Hide' : 'Show'}
        </button>
        <button type="button" className="btn" onClick={save}>
          Save
        </button>
        <button type="button" className="btn btn-primary" disabled={testing} onClick={test}>
          {testing ? 'Testing…' : 'Save & test'}
        </button>
      </div>
      {verdict ? (
        <p className={verdict.startsWith('Works') ? 'callout' : 'error-text'} role="status">
          {verdict}
        </p>
      ) : null}
    </div>
  );
}

function KeysSection() {
  return (
    <section className="card">
      <h2>2 · Use your own cloud keys (optional)</h2>
      <p className="card-sub">
        Cloud models are called by our server, because that is where a key can
        be kept out of a web page. Paste yours and it is stored in{' '}
        <em>this browser only</em>, sent along with each of your runs, used for
        that run, and never written down on the server — not in the database,
        not in the activity log. Clear the field and press Save to remove it.
      </p>
      <div className="setup-keys">
        <KeyField
          provider="gemini"
          label="Gemini"
          consoleUrl="https://aistudio.google.com/apikey"
        />
        <KeyField provider="groq" label="Groq" consoleUrl="https://console.groq.com/keys" />
      </div>
    </section>
  );
}

export function SetupGuide() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Set up</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mist-400">
        EdgePilot compares the AI on your computer with the AI in the cloud. To do
        that from a website, two things have to be true: your Ollama must accept
        requests from this site, and the cloud side needs a key. Both take a
        minute, and both are done once.
      </p>
      <OllamaSection />
      <KeysSection />
    </div>
  );
}
