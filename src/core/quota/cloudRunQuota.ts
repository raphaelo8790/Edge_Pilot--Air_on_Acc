/**
 * A cap on how much of the SERVER's cloud quota one visitor may spend.
 *
 * WHY. A cloud vision run is 21 requests to Gemini or Groq. When the visitor
 * brought their own key, that is their business. When they are using the
 * key the operator configured, an ungated button is an invitation to spend
 * it all evening - so a visitor gets a small number of server-key runs per
 * hour, and a clear message when they have had them.
 *
 * WHAT IT IS NOT. Not a security boundary and not exact. It is in-memory,
 * per server process: on a serverless host each instance keeps its own
 * count, so a determined visitor across several instances gets several
 * allowances. That still turns "unlimited" into "a handful", which is the
 * point. Keyed on the browser's own session id; a visitor with no session
 * id shares one anonymous bucket.
 */

const WINDOW_MS = 60 * 60 * 1000;

/** Server-key cloud runs a visitor may start per window. */
export const CLOUD_RUNS_PER_HOUR = 5;

const buckets = new Map<string, number[]>();

function prune(stamps: number[], now: number): number[] {
  return stamps.filter((stamp) => now - stamp < WINDOW_MS);
}

export interface QuotaVerdict {
  allowed: boolean;
  /** Runs left in the window after this one, when allowed. */
  remaining: number;
  /** Seconds until the oldest run in the window expires, when refused. */
  retryAfterSeconds: number;
}

/**
 * Records one run against the visitor's bucket if there is room. Called
 * BEFORE the run: a refused run costs nothing.
 */
export function takeCloudRun(
  sessionId: string | null | undefined,
  now = Date.now()
): QuotaVerdict {
  const key = sessionId && sessionId.trim() ? sessionId.trim() : 'anonymous';
  const stamps = prune(buckets.get(key) ?? [], now);

  if (stamps.length >= CLOUD_RUNS_PER_HOUR) {
    const oldest = Math.min(...stamps);
    buckets.set(key, stamps);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
    };
  }

  stamps.push(now);
  buckets.set(key, stamps);

  return {
    allowed: true,
    remaining: CLOUD_RUNS_PER_HOUR - stamps.length,
    retryAfterSeconds: 0,
  };
}

/** For tests. */
export function resetCloudRunQuota(): void {
  buckets.clear();
}
