/**
 * A visitor's own Gemini and Groq keys, kept in THIS browser.
 *
 * WHY. Hosted, the project's keys (if the operator set any) would be spent
 * by every visitor. A visitor with their own can use those instead; the
 * server uses the key for that one request and keeps nothing. See
 * modules/benchmark/infrastructure/visitor-keys.ts for the server half.
 *
 * WHERE THEY LIVE. localStorage, same as the run history. That means: this
 * browser only, cleared when the visitor clears it, never sent anywhere but
 * this app's own API - which forwards it to the vendor it belongs to and
 * nowhere else. It is not encryption: anyone with access to this browser
 * profile can read it, which is the same truth as for any key pasted into
 * any web app's settings.
 *
 * EVERY ACCESS IS GUARDED, as in runHistory.ts: localStorage throws in some
 * privacy modes rather than returning null.
 */

import { useSyncExternalStore } from 'react';

export type CloudKeyProvider = 'gemini' | 'groq';

const KEYS: Record<CloudKeyProvider, string> = {
  gemini: 'edgepilot.keys.gemini',
  groq: 'edgepilot.keys.groq',
};

/** Must match GEMINI_KEY_HEADER / GROQ_KEY_HEADER in visitor-keys.ts. */
export const KEY_HEADERS: Record<CloudKeyProvider, string> = {
  gemini: 'x-edgepilot-gemini-key',
  groq: 'x-edgepilot-groq-key',
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function readApiKey(provider: CloudKeyProvider): string {
  if (typeof window === 'undefined') return '';

  try {
    return (window.localStorage.getItem(KEYS[provider]) ?? '').trim();
  } catch {
    return '';
  }
}

export function writeApiKey(provider: CloudKeyProvider, value: string): void {
  try {
    const trimmed = value.trim();
    if (trimmed) window.localStorage.setItem(KEYS[provider], trimmed);
    else window.localStorage.removeItem(KEYS[provider]);
  } catch {
    /* blocked - the field still shows what was typed for this visit */
  }
  notify();
}

/** Headers to attach to an API call: only the keys that are set. */
export function apiKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const provider of ['gemini', 'groq'] as const) {
    const key = readApiKey(provider);
    if (key) headers[KEY_HEADERS[provider]] = key;
  }

  return headers;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Whether a key is set, for a component. Never the key itself: nothing
 *  that renders needs it, and a value that is not in the tree cannot leak
 *  into a screenshot or a bug report. */
export function useHasApiKey(provider: CloudKeyProvider): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readApiKey(provider) !== '',
    () => false
  );
}
