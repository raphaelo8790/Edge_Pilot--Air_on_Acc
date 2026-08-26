/**
 * EdgePilot AI - a visitor's own cloud API keys, for one request
 *
 * WHY. Hosted, the server's GEMINI_API_KEY and GROQ_API_KEY belong to the
 * project, and every visitor's run would spend them. A visitor who has their
 * own keys should be able to use those instead - and a visitor without any
 * should still be able to use the project's, if the operator chose to set
 * them.
 *
 * HOW. The browser keeps the visitor's keys in ITS OWN localStorage (see
 * components/dashboard/apiKeys.ts) and sends them on each request in two
 * headers. This module reads those headers and produces a config the
 * registry can be built from. A registry built this way is never cached:
 * it lives for one request and is dropped, so one visitor's key can never
 * be used for another visitor's run.
 *
 * WHAT IS NEVER DONE WITH THEM. They are not written to the database, not
 * written to the session log, and not echoed in any response. The only
 * place a visitor's key goes is the vendor it belongs to, in the same
 * header the server's own key would have used.
 */

import type { BenchmarkConfig } from './config';

export const GEMINI_KEY_HEADER = 'x-edgepilot-gemini-key';
export const GROQ_KEY_HEADER = 'x-edgepilot-groq-key';

/** Longer than any real key; a bound so a header cannot be used as a payload. */
const MAX_KEY_LENGTH = 512;

export interface VisitorKeys {
  geminiApiKey: string | null;
  groqApiKey: string | null;
}

function readKey(headers: Headers, name: string): string | null {
  const raw = headers.get(name);
  if (raw === null) return null;

  const value = raw.trim();
  // A key is printable ASCII with no spaces. Anything else is not a key and
  // is dropped rather than forwarded to a vendor.
  if (value.length === 0 || value.length > MAX_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(value)) {
    return null;
  }

  return value;
}

export function visitorKeysFrom(request: Request): VisitorKeys {
  return {
    geminiApiKey: readKey(request.headers, GEMINI_KEY_HEADER),
    groqApiKey: readKey(request.headers, GROQ_KEY_HEADER),
  };
}

export function hasVisitorKeys(keys: VisitorKeys): boolean {
  return keys.geminiApiKey !== null || keys.groqApiKey !== null;
}

/** The server's config with the visitor's keys laid over it where present. */
export function applyVisitorKeys(
  config: BenchmarkConfig,
  keys: VisitorKeys
): BenchmarkConfig {
  return {
    ...config,
    geminiApiKey: keys.geminiApiKey ?? config.geminiApiKey,
    groqApiKey: keys.groqApiKey ?? config.groqApiKey,
  };
}
