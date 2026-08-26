/**
 * A provider that replays measurements the browser already took.
 *
 * WHY. BenchmarkRunner is where a run becomes evidence: cold-start isolation,
 * the summary, hardware fit, the readiness score, every limitation line. All
 * of that must be identical whether the model was called by this server or
 * by the visitor's browser tab, or the two kinds of run stop being
 * comparable. So the tab does only the part it alone can do - the HTTP calls
 * to the visitor's own Ollama - and this adapter hands those results to the
 * runner as if it had made the calls itself.
 *
 * It refuses to be anything but what it was given: `measure` returns the
 * recorded responses and ignores its arguments, and it reports itself as
 * Ollama so the privacy and hardware logic apply the local rules.
 */

import type { HardwareObservation } from '../../core/services/HardwareFitAssessor';
import type { RecordedMeasurement } from '../../application/dtos/BenchmarkRequest';
import type { AIResponse, BenchmarkResult } from '../../core/ports/AIProvider';
import type {
  MeasuredAIProvider,
  MeasuredResponse,
  ProviderMetadata,
} from './types';

export class RecordedProvider implements MeasuredAIProvider {
  public readonly name = 'ollama';
  public readonly type = 'local' as const;

  private readonly recorded: RecordedMeasurement;

  constructor(recorded: RecordedMeasurement) {
    this.recorded = recorded;
  }

  public describe(): ProviderMetadata {
    return {
      name: this.name,
      type: this.type,
      displayName: 'Ollama (local, measured in the browser)',
      baseUrl: this.recorded.host,
      privacyLevel: 'high',
      reports: { ttft: true, outputTokens: true },
      officialSource:
        'https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion',
    };
  }

  public isConfigured(): boolean {
    return true;
  }

  public async measure(): Promise<MeasuredResponse[]> {
    return this.recorded.responses.map((response) => ({ ...response }));
  }

  public async generate(): Promise<AIResponse> {
    const first = this.recorded.responses[0];
    return {
      text: first.text,
      latency_ms: first.latency_ms,
      tokens_per_second: first.tokens_per_second,
      ttft_ms: first.ttft_ms,
      success: first.success,
      error_message: first.error_message,
    };
  }

  public async benchmark(): Promise<BenchmarkResult[]> {
    return this.recorded.responses.slice(1).map((response, index) => ({
      iteration: index + 1,
      latency_ms: response.latency_ms,
      tokens_per_second: response.tokens_per_second,
      ttft_ms: response.ttft_ms,
      success: response.success,
      error_message: response.error_message,
    }));
  }

  /**
   * The residency probe for a recorded run. The runner asks once before the
   * measurement and once after; the browser took both readings at those
   * moments, so they are handed back in that order.
   */
  public residencyProbe(): () => Promise<HardwareObservation | null> {
    const readings = [this.recorded.resident_before, this.recorded.resident_after];
    let call = 0;

    return async () => {
      const reading = readings[Math.min(call, readings.length - 1)] ?? null;
      call += 1;
      return reading;
    };
  }
}

/** The one-provider chain a recorded run is scored through. No fallback: the
 *  visitor's machine either answered or it did not, and a cloud model is not
 *  a substitute measurement of it. */
export function recordedChain(provider: RecordedProvider) {
  return {
    has: (name: string) => name === provider.name,
    chainFor: (name: string): MeasuredAIProvider[] =>
      name === provider.name ? [provider] : [],
  };
}
