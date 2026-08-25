/**
 * Measurement vocabulary for the benchmark layer.
 *
 * The acceptance criterion this file exists to satisfy: "captures latency,
 * token and usage evidence without inventing cost or quality figures". Every
 * number that leaves this module carries a label saying how it was obtained,
 * so a reader can tell a stopwatch reading from an arithmetic derivation from
 * a placeholder.
 */

import type {
  AIProvider,
  AIResponse,
} from '@/modules/benchmark/core/ports/AIProvider';
import type { ProviderErrorCode } from './errors';

/**
 * How a reported figure was obtained.
 *
 * - `measured`    — observed directly by this process (a clock reading, or a
 *                   token count the provider itself reported).
 * - `derived`     — arithmetic over measured values only (tokens ÷ seconds).
 * - `unavailable` — the provider did not report it and it cannot be derived.
 *                   The field is null; it is never filled with a guess.
 * - `simulated`   — produced by the demo adapter, not by a real model.
 */
export type MeasurementStatus =
  | 'measured'
  | 'derived'
  | 'unavailable'
  | 'simulated';

/**
 * The per-field provenance attached to one iteration's measurements.
 */
export interface MeasurementProvenance {
  latencyMs: MeasurementStatus;
  ttftMs: MeasurementStatus;
  tokensPerSecond: MeasurementStatus;
  outputTokens: MeasurementStatus;
}

/**
 * Usage figures a provider reported about itself. All optional: a provider
 * that does not report a field leaves it null rather than zero.
 */
export interface ProviderUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  /**
   * Generation time as the provider measured it, when it reports one
   * (Ollama's `eval_duration`). Distinct from our own wall-clock latency,
   * which includes queueing and transport.
   */
  providerReportedDurationMs: number | null;
}

export function emptyUsage(): ProviderUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    providerReportedDurationMs: null,
  };
}

/**
 * One iteration, as an adapter produces it, before it is narrowed to the
 * shared `BenchmarkResult` shape that the rest of the codebase consumes.
 */
export interface MeasuredResponse extends AIResponse {
  usage: ProviderUsage;
  provenance: MeasurementProvenance;
  /** Present only when `success` is false. */
  failureCode: ProviderErrorCode | null;
}

/**
 * Static facts about an adapter, used by the registry, the API's provider
 * listing, and the docs. `officialSource` is the acceptance criterion that
 * every recommendation cites at least one official source — the source for
 * "this is how you read a token count out of this provider" lives with the
 * adapter that does the reading.
 */
export interface ProviderMetadata {
  /** Slug. Matches `providers.name` in the database and the request enum. */
  name: string;
  type: 'local' | 'cloud';
  /** Human-readable, for the dashboard. */
  displayName: string;
  /** Resolved endpoint, or null for a provider with no configurable host. */
  baseUrl: string | null;
  /**
   * Data never leaves the machine for a local provider. Consumed by the
   * readiness calculation's privacy input, which is otherwise a guess.
   */
  privacyLevel: 'low' | 'medium' | 'high';
  /** Which fields this provider can actually report. */
  reports: {
    ttft: boolean;
    outputTokens: boolean;
  };
  /** Official documentation for the streaming/usage contract used here. */
  officialSource: string;
}

/**
 * An `AIProvider` that also describes itself and says whether it is usable in
 * the current environment.
 *
 * This extends the shared port additively — no existing member of `AIProvider`
 * changes shape — so the vision module and anything else already written
 * against `AIProvider` keeps compiling untouched.
 */
export interface MeasuredAIProvider extends AIProvider {
  describe(): ProviderMetadata;
  /**
   * False when the adapter has no credential or host in this environment.
   * The registry uses it to skip a provider instead of calling it and
   * collecting an authentication failure as if it were a measurement.
   */
  isConfigured(): boolean;
  /** Same as `benchmark`, but keeps usage and provenance. */
  measure(
    prompt: string,
    model: string,
    iterations: number
  ): Promise<MeasuredResponse[]>;
}
