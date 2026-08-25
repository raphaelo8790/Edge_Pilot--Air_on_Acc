/**
 * Runs one benchmark request against the provider chain and turns the raw
 * adapter output into the typed measurement envelope.
 *
 * This service does no I/O of its own beyond the providers it is handed, and
 * it knows nothing about the database — persistence is layered on top in the
 * use case, so a run can still be returned to the caller when the database is
 * unreachable.
 *
 * Fallback policy, in one sentence: fall back only when the provider failed
 * for a reason another provider could plausibly not share.
 */

import type { ReadinessCalculator } from '../../core/services/ReadinessCalculator';
import {
  decodeFailure,
  describeProviderError,
  isRetryableProviderError,
  type ProviderErrorCode,
} from '../../infrastructure/providers/errors';
import type { ProviderRegistry } from '../../infrastructure/providers/ProviderRegistry';
import type {
  MeasuredAIProvider,
  MeasuredResponse,
} from '../../infrastructure/providers/types';
import {
  summarise,
  type FallbackAttempt,
  type MeasuredIteration,
  type MeasurementSummary,
} from '../dtos/BenchmarkMeasurement';

/**
 * Inputs the readiness score needs that this module does not measure.
 *
 * They are parameters rather than constants so that when device profiling
 * (Moe's work package) and a cost model land, they can be supplied without
 * touching this file — and so that today's defaults are visible at the call
 * site instead of buried in an expression.
 */
export interface UnmeasuredReadinessInputs {
  /**
   * 0-100. How well the device suits the workload. Not measured here: it
   * needs the device profile and the eight reference profiles.
   */
  hardwareFit: number;
  /** USD per 1000 requests. Not measured here: there is no cost model yet. */
  estimatedCostPer1kRequests: number;
}

export const DEFAULT_UNMEASURED_INPUTS: UnmeasuredReadinessInputs = {
  hardwareFit: 50,
  estimatedCostPer1kRequests: 0,
};

export interface BenchmarkRunnerRequest {
  provider: string;
  model: string;
  prompt: string;
  iterations: number;
  unmeasured?: Partial<UnmeasuredReadinessInputs>;
}

export interface BenchmarkRunOutcome {
  requestedProvider: string;
  effectiveProvider: string | null;
  model: string;
  fallbackUsed: boolean;
  fallbackChain: FallbackAttempt[];
  simulated: boolean;
  results: MeasuredIteration[];
  summary: MeasurementSummary;
  readinessScore: number | null;
  readinessBreakdown: {
    hardwareFit: number;
    latencyScore: number;
    privacyScore: number;
    costScore: number;
    reliabilityScore: number;
  } | null;
  recommendation: string;
  evidence: string[];
  assumptions: string[];
  limitations: string[];
  /** Set when the whole chain failed and nothing was measured. */
  terminalErrorCode: ProviderErrorCode | null;
}

const PRIVACY_SCORES: Record<'low' | 'medium' | 'high', number> = {
  low: 30,
  medium: 60,
  high: 100,
};

export class BenchmarkRunner {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly readinessCalculator: ReadinessCalculator
  ) {}

  public async run(
    request: BenchmarkRunnerRequest
  ): Promise<BenchmarkRunOutcome> {
    const unmeasured: UnmeasuredReadinessInputs = {
      ...DEFAULT_UNMEASURED_INPUTS,
      ...(request.unmeasured ?? {}),
    };

    const chain = this.registry.chainFor(request.provider);
    const attempts: FallbackAttempt[] = [];

    if (!this.registry.has(request.provider)) {
      attempts.push({
        provider: request.provider,
        outcome: 'skipped',
        error_code: 'not_configured',
        detail: `No adapter is registered under the name "${request.provider}".`,
      });
    } else if (chain.length === 0 || chain[0].name !== request.provider) {
      attempts.push({
        provider: request.provider,
        outcome: 'skipped',
        error_code: 'not_configured',
        detail: describeProviderError('not_configured').explanation,
      });
    }

    let accepted: {
      provider: MeasuredAIProvider;
      responses: MeasuredResponse[];
    } | null = null;
    let terminalErrorCode: ProviderErrorCode | null = null;

    for (let index = 0; index < chain.length; index += 1) {
      const provider = chain[index];
      const responses = await provider.measure(
        request.prompt,
        request.model,
        request.iterations
      );

      const succeeded = responses.filter((response) => response.success);

      if (succeeded.length > 0) {
        attempts.push({
          provider: provider.name,
          outcome: 'succeeded',
          error_code: null,
          detail: `${succeeded.length}/${responses.length} iterations succeeded.`,
        });
        accepted = { provider, responses };
        break;
      }

      const failureCode = dominantFailureCode(responses);

      attempts.push({
        provider: provider.name,
        outcome: 'failed',
        error_code: failureCode,
        detail:
          responses[0]?.error_message ??
          'The provider returned no iterations at all.',
      });

      terminalErrorCode = failureCode;

      // A non-retryable failure ends the chain. Trying another provider after
      // an `invalid_model` or an `unauthorized` would either hide a
      // configuration fault or answer a question nobody asked — the caller
      // asked to measure THAT model on THAT provider.
      if (failureCode !== null && !isRetryableProviderError(failureCode)) {
        break;
      }
    }

    // Nothing measured anywhere.
    if (accepted === null) {
      const emptySummary = summarise([], request.iterations);

      return {
        requestedProvider: request.provider,
        effectiveProvider: null,
        model: request.model,
        fallbackUsed: attempts.filter((a) => a.outcome === 'failed').length > 1,
        fallbackChain: attempts,
        simulated: false,
        results: [],
        summary: emptySummary,
        readinessScore: null,
        readinessBreakdown: null,
        recommendation:
          'No recommendation: no iteration completed, so there is nothing to base one on.',
        evidence: [],
        assumptions: [],
        limitations: [
          'Every provider in the chain failed; no latency or token figure was captured.',
          ...attempts.map(
            (attempt) => `${attempt.provider}: ${attempt.detail}`
          ),
        ],
        terminalErrorCode:
          terminalErrorCode ??
          (chain.length === 0 ? 'not_configured' : 'provider_error'),
      };
    }

    const provider = accepted.provider;
    const metadata = provider.describe();
    const simulated = metadata.name === 'demo';

    const results = accepted.responses.map((response, index) =>
      toIteration(response, index + 1, provider.name, request.model)
    );

    const summary = summarise(results, request.iterations);

    const latencyForScore = summary.latency_ms_mean ?? 0;
    const reliabilityScore = summary.success_rate_percent;
    const privacyScore = PRIVACY_SCORES[metadata.privacyLevel];

    const readinessScore = this.readinessCalculator.calculate({
      hardwareFit: unmeasured.hardwareFit,
      latencyMs: latencyForScore,
      privacyLevel: metadata.privacyLevel,
      estimatedCost: unmeasured.estimatedCostPer1kRequests,
      reliabilityScore,
    });

    // Recomputed here only to report the breakdown; the score itself is
    // whatever the shared calculator says, and this file does not second-guess
    // it. The two must agree, which the unit tests assert.
    const latencyScore = Math.max(0, 100 - latencyForScore / 100);
    const costScore = Math.max(
      0,
      100 - unmeasured.estimatedCostPer1kRequests * 1000
    );

    const fallbackUsed = provider.name !== request.provider;

    const evidence = buildEvidence(summary, metadata.name, request.model);
    const assumptions = buildAssumptions(unmeasured, metadata.name, simulated);
    const limitations = buildLimitations(summary, attempts, metadata, simulated);

    return {
      requestedProvider: request.provider,
      effectiveProvider: provider.name,
      model: request.model,
      fallbackUsed,
      fallbackChain: attempts,
      simulated,
      results,
      summary,
      readinessScore,
      readinessBreakdown: {
        hardwareFit: Math.round(unmeasured.hardwareFit),
        latencyScore: Math.round(latencyScore),
        privacyScore: Math.round(privacyScore),
        costScore: Math.round(costScore),
        reliabilityScore: Math.round(reliabilityScore),
      },
      recommendation: buildRecommendation(
        readinessScore,
        summary,
        metadata.name,
        simulated
      ),
      evidence,
      assumptions,
      limitations,
      terminalErrorCode: null,
    };
  }
}

function toIteration(
  response: MeasuredResponse,
  iteration: number,
  providerName: string,
  model: string
): MeasuredIteration {
  const failure = decodeFailure(response.error_message);

  return {
    iteration,
    provider: providerName,
    model,
    latency_ms: response.latency_ms,
    ttft_ms: response.ttft_ms,
    tokens_per_second: response.tokens_per_second,
    output_tokens: response.usage.outputTokens,
    input_tokens: response.usage.inputTokens,
    success: response.success,
    error_code: response.failureCode ?? failure?.code ?? null,
    error_message: failure?.message ?? response.error_message,
    provenance: {
      latency_ms: response.provenance.latencyMs,
      ttft_ms: response.provenance.ttftMs,
      tokens_per_second: response.provenance.tokensPerSecond,
      output_tokens: response.provenance.outputTokens,
    },
  };
}

/** The code shared by the most failed iterations; ties go to the first seen. */
function dominantFailureCode(
  responses: MeasuredResponse[]
): ProviderErrorCode | null {
  const counts = new Map<ProviderErrorCode, number>();

  for (let index = 0; index < responses.length; index += 1) {
    const code = responses[index].failureCode;

    if (code) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  let best: ProviderErrorCode | null = null;
  let bestCount = 0;

  counts.forEach((count, code) => {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  });

  return best;
}

function buildEvidence(
  summary: MeasurementSummary,
  providerName: string,
  model: string
): string[] {
  const evidence: string[] = [
    `Measured ${summary.iterations_succeeded}/${summary.iterations_run} successful iterations of ${model} on ${providerName}.`,
  ];

  if (summary.latency_ms_mean !== null) {
    evidence.push(
      `Wall-clock latency: mean ${summary.latency_ms_mean} ms, min ${summary.latency_ms_min} ms, max ${summary.latency_ms_max} ms (measured).`
    );
  }

  if (summary.latency_ms_p50 !== null) {
    evidence.push(`Median latency: ${summary.latency_ms_p50} ms (measured).`);
  }

  if (summary.ttft_ms_mean !== null) {
    evidence.push(
      `Time to first token: mean ${summary.ttft_ms_mean} ms (measured from the streamed response).`
    );
  }

  if (summary.tokens_per_second_mean !== null) {
    evidence.push(
      `Throughput: mean ${summary.tokens_per_second_mean} tokens/second (derived from provider-reported token counts and measured duration).`
    );
  }

  if (summary.output_tokens_total !== null) {
    evidence.push(
      `Output tokens across the run: ${summary.output_tokens_total} (reported by the provider).`
    );
  }

  return evidence;
}

function buildAssumptions(
  unmeasured: UnmeasuredReadinessInputs,
  providerName: string,
  simulated: boolean
): string[] {
  const assumptions: string[] = [
    `Hardware fit is assumed to be ${unmeasured.hardwareFit}/100. It is not measured by this module; device-aware scoring belongs to the device-profile work package.`,
    `Cost is assumed to be $${unmeasured.estimatedCostPer1kRequests} per 1000 requests. No cost model has been measured, so the cost component of the readiness score carries no evidence.`,
    `The privacy score is assigned from the provider's deployment model (${providerName}), not from a review of the vendor's data-handling terms.`,
  ];

  if (simulated) {
    assumptions.push(
      'Every figure in this run came from the simulated demo adapter. None of it is a measurement of any model.'
    );
  }

  return assumptions;
}

function buildLimitations(
  summary: MeasurementSummary,
  attempts: FallbackAttempt[],
  metadata: { name: string; reports: { ttft: boolean; outputTokens: boolean } },
  simulated: boolean
): string[] {
  const limitations: string[] = [];

  if (simulated) {
    limitations.push(
      'SIMULATED RUN — the demo adapter produced these numbers. Do not cite them as evidence.'
    );
  }

  if (summary.iterations_succeeded < summary.iterations_run) {
    limitations.push(
      `${summary.iterations_run - summary.iterations_succeeded} of ${summary.iterations_run} iterations failed; the aggregates cover the successful ones only.`
    );
  }

  if (summary.iterations_succeeded > 0 && summary.iterations_succeeded < 3) {
    limitations.push(
      'Fewer than three successful iterations: the mean is not a stable estimate and no median is reported.'
    );
  }

  if (summary.ttft_ms_mean === null) {
    limitations.push(
      `No time-to-first-token was captured for ${metadata.name} in this run.`
    );
  }

  if (summary.tokens_per_second_mean === null) {
    limitations.push(
      `No token counts were reported, so throughput is unavailable for ${metadata.name} in this run.`
    );
  }

  const failed = attempts.filter((attempt) => attempt.outcome !== 'succeeded');

  for (let index = 0; index < failed.length; index += 1) {
    limitations.push(
      `${failed[index].provider} was ${failed[index].outcome}: ${failed[index].detail}`
    );
  }

  limitations.push(
    'Latency is measured from this server, so it includes network transit to the provider and is specific to this machine and connection.'
  );

  return limitations;
}

function buildRecommendation(
  readinessScore: number,
  summary: MeasurementSummary,
  providerName: string,
  simulated: boolean
): string {
  if (simulated) {
    return `No recommendation: this run used the simulated demo adapter, not ${providerName}.`;
  }

  if (summary.iterations_succeeded === 0) {
    return 'No recommendation: no iteration succeeded.';
  }

  const confidence =
    summary.iterations_succeeded >= 3
      ? ''
      : ' Confidence is low — fewer than three successful iterations.';

  if (readinessScore >= 70) {
    return `Recommended on ${providerName}: readiness ${readinessScore}/100 with a measured mean latency of ${summary.latency_ms_mean} ms and a ${summary.success_rate_percent}% success rate.${confidence}`;
  }

  return `Not recommended on ${providerName}: readiness ${readinessScore}/100 with a measured mean latency of ${summary.latency_ms_mean} ms and a ${summary.success_rate_percent}% success rate.${confidence}`;
}
