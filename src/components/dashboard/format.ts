/**
 * Pure display helpers for the benchmark dashboard.
 *
 * The wire contract (docs/internal/benchmark-api.md) makes every aggregate
 * nullable on purpose: "reporting 0 ms for 'we never got an answer' is the
 * single most misleading number this system could produce." These helpers
 * exist so no component ever turns a null into a zero.
 */

/** "1,234 ms" — or the honest fallback when the value was not measured. */
export function fmtMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return "not measured";
  return `${Math.round(value).toLocaleString("en-US")} ms`;
}

/** "47.9" with fixed decimals — or the honest fallback. */
export function fmtNum(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value === null || value === undefined) return "not measured";
  return value.toFixed(decimals);
}

/** "80%" for 0–100 percentages. */
export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "not measured";
  return `${Math.round(value)}%`;
}

/** RFC-4122-shaped uuid check — the API validates workload/device/benchmark ids as uuids. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

/**
 * The scaffold endpoints for workloads/devices echo placeholder ids
 * ("temp-workload-id") instead of persisting. Detecting that is how the UI
 * tells the user their row was NOT saved rather than pretending it was.
 */
export function isPlaceholderId(id: string): boolean {
  return !isUuid(id);
}

/** Map a provider error_code from the wire contract to a human sentence. */
export function describeErrorCode(code: string | null): string {
  switch (code) {
    case "timeout":
      return "The provider did not answer within the configured timeout.";
    case "local_unavailable":
      return "The local runtime (Ollama) is not reachable on this server.";
    case "invalid_model":
      return "The provider does not know this model name.";
    case "unauthorized":
      return "The server-side API key was rejected.";
    case "rate_limited":
      return "The provider rate-limited the request.";
    case "invalid_response":
      return "The provider answered with something unparseable.";
    case "not_configured":
      return "No API key/endpoint is configured for this provider on the server.";
    case "provider_error":
      return "The provider reported an internal error.";
    case null:
      return "";
    default:
      return code;
  }
}

/** Elapsed seconds as "1m 05s" for the long-running benchmark spinner. */
export function fmtElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return m > 0 ? `${m}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}
