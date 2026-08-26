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
  assessPrivacy,
  type PrivacyAssessment,
  type ProviderTier,
} from '../../core/services/PrivacyAssessor';
import { lookupPolicyFacts } from '../../core/services/privacy-catalogue';
import {
  assessHardwareFit,
  type HardwareFitAssessment,
  type HardwareObservation,
} from '../../core/services/HardwareFitAssessor';
import {
  decodeFailure,
  describeProviderError,
  isRetryableProviderError,
  type ProviderErrorCode,
} from '../../infrastructure/providers/errors';

import type {
  MeasuredAIProvider,
  MeasuredResponse,
} from '../../infrastructure/providers/types';
import {
  summarise,
  type FallbackAttempt,
  type MeasuredIteration,
  type MeasurementSummary,
  type ColdStart,
} from '../dtos/BenchmarkMeasurement';

/**
 * Inputs the readiness score needs that this module does not measure.
 *
 * They are parameters rather than constants so that when a cost model lands
 * it can be supplied without touching this file — and so that today's
 * defaults are visible at the call site instead of buried in an expression.
 */
export interface UnmeasuredReadinessInputs {
  /**
   * 0-100, or null when it could not be established. Supplied by the caller
   * only when no residency probe is available; otherwise the probe measures
   * it. Null rather than a placeholder, so readiness renormalises instead of
   * averaging in a number nobody produced.
   */
  hardwareFit: number | null;
  /** USD per 1000 requests. Not measured here: there is no cost model yet. */
  estimatedCostPer1kRequests: number;
}

export const DEFAULT_UNMEASURED_INPUTS: UnmeasuredReadinessInputs = {
  hardwareFit: null,
  estimatedCostPer1kRequests: 0,
};

export interface BenchmarkRunnerRequest {
  provider: string;
  model: string;
  prompt: string;
  iterations: number;
  unmeasured?: Partial<UnmeasuredReadinessInputs>;
  /**
   * Billing tier the user declared for this provider. No inference API
   * reports it, so it is declared rather than detected. Free and paid tiers
   * commonly differ on retention and training-on-input.
   */
  tier?: ProviderTier;
}

export interface BenchmarkRunOutcome {
  requestedProvider: string;
  effectiveProvider: string | null;
  model: string;
  fallbackUsed: boolean;
  fallbackChain: FallbackAttempt[];
  simulated: boolean;
  results: MeasuredIteration[];
  /**
   * The extra first call, measured and then excluded from `summary` and from
   * every score. Null when nothing ran.
   */
  coldStart: ColdStart | null;
  summary: MeasurementSummary;
  readinessScore: number | null;
  readinessBreakdown: {
    /** Null when hardware fit could not be assessed - never 0. */
    hardwareFit: number | null;
    latencyScore: number;
    costScore: number;
    reliabilityScore: number;
  } | null;
  /**
   * What was observed about where the request went, which policy facts were
   * verified, and which were not. Null when nothing ran.
   */
  privacy: PrivacyAssessment | null;
  /**
   * What the runtime reported about memory during this run: whether the model
   * fitted in GPU memory, partially offloaded, or ran on CPU. Null when
   * nothing ran or no probe was supplied.
   */
  hardware: HardwareFitAssessment | null;
  recommendation: string;
  evidence: string[];
  assumptions: string[];
  limitations: string[];
  /** Set when the whole chain failed and nothing was measured. */
  terminalErrorCode: ProviderErrorCode | null;
}

/**
 * What the runner needs from a registry: a chain to walk. The full registry
 * satisfies it; so does the single-provider chain a browser-recorded run is
 * scored through.
 */
export interface ProviderChain {
  has(name: string): boolean;
  chainFor(requested: string): MeasuredAIProvider[];
}

export class BenchmarkRunner {
  constructor(
    private readonly registry: ProviderChain,
    private readonly readinessCalculator: ReadinessCalculator,
    /**
     * Optional. Reads memory residency from the runtime after a run so that
     * hardware fit is measured. Absent in unit tests and on any provider that
     * cannot report it; hardware fit is then simply not assessed.
     */
    private readonly residencyProbe?: (
      model: string,
      providerName: string
    ) => Promise<HardwareObservation | null>
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
      residentBefore: boolean | null;
    } | null = null;
    let terminalErrorCode: ProviderErrorCode | null = null;

    for (let index = 0; index < chain.length; index += 1) {
      const provider = chain[index];
      const providerMeta = provider.describe();

      // Was the model already loaded BEFORE anything ran? This has to be read
      // now, because after the first call the answer is always yes. It is the
      // difference between "this model is slow" and "this model had to be
      // read off disk", and nothing downstream can recover it later.
      let residentBefore: boolean | null = null;

      if (this.residencyProbe && providerMeta.type === 'local') {
        try {
          const before = await this.residencyProbe(
            request.model,
            providerMeta.name
          );

          // The probe returns null when it could not read residency at all -
          // a different thing from reading it and finding nothing resident.
          // Left unhandled this threw and was swallowed by the catch below,
          // which produced the right value for the wrong reason and would
          // have hidden any other fault in here.
          residentBefore =
            before === null
              ? null
              : before.residentBytes !== null && before.residentBytes > 0;
        } catch {
          residentBefore = null;
        }
      }

      // One MORE than asked for. The first is discarded - see ColdStartSchema.
      const responses = await provider.measure(
        request.prompt,
        request.model,
        request.iterations + 1
      );

      // Selection and reporting both look ONLY at the iterations the caller
      // asked for. The discarded cold start is not one of them: counting it
      // made the chain report "4/4 iterations succeeded" for a request of 3,
      // and a provider whose only successful call was the throwaway has not
      // done the work it was asked to do.
      const measuredOnly = responses.slice(1);
      const succeeded = measuredOnly.filter((response) => response.success);

      if (succeeded.length > 0) {
        attempts.push({
          provider: provider.name,
          outcome: 'succeeded',
          error_code: null,
          detail: `${succeeded.length}/${measuredOnly.length} iterations succeeded, after a discarded cold start.`,
        });
        accepted = { provider, responses, residentBefore };
        break;
      }

      const failureCode = dominantFailureCode(measuredOnly);

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
        coldStart: null,
        summary: emptySummary,
        readinessScore: null,
        readinessBreakdown: null,
      privacy: null,
      hardware: null,
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

    // The first response is the cold start and is not a measurement of the
    // model. Everything after it is, and is renumbered from 1 so the caller
    // sees exactly the iterations it asked for.
    const warmupResponse = accepted.responses[0] ?? null;
    const measuredResponses = accepted.responses.slice(1);

    const results = measuredResponses.map((response, index) =>
      toIteration(response, index + 1, provider.name, request.model)
    );

    const coldStart = buildColdStart(
      warmupResponse === null
        ? null
        : toIteration(warmupResponse, 1, provider.name, request.model),
      accepted.residentBefore
    );

    const summary = summarise(results, request.iterations);

    const latencyForScore = summary.latency_ms_mean ?? 0;
    const reliabilityScore = summary.success_rate_percent;
    // Privacy is assessed from where the request actually went, plus policy
    // facts that carry a source and a date. It is null when this provider's
    // terms have not been verified for the declared tier - never a guess.
    // Residency must be read while the model is still loaded, so this happens
    // immediately after the iterations and before anything is scored.
    let observation: HardwareObservation | null = null;

    if (this.residencyProbe && metadata.type === 'local') {
      try {
        observation = await this.residencyProbe(request.model, metadata.name);
      } catch {
        observation = null;
      }
    }

    const hardware = assessHardwareFit(metadata.type, observation);
    const hardwareFit =
      hardware.score !== null ? hardware.score : unmeasured.hardwareFit;

    const tier: ProviderTier =
      request.tier ?? (metadata.type === 'local' ? 'local' : 'unknown');
    const privacy = assessPrivacy(
      metadata.baseUrl,
      tier,
      lookupPolicyFacts(metadata.name, tier)
    );

    const readinessScore = this.readinessCalculator.calculate({
      hardwareFit,
      latencyMs: latencyForScore,
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

    const evidence = buildEvidence(
      summary,
      metadata.name,
      request.model,
      hardware,
      coldStart
    );
    const assumptions = buildAssumptions(unmeasured, hardware, simulated);
    const limitations = buildLimitations(summary, attempts, metadata, simulated);

    return {
      requestedProvider: request.provider,
      effectiveProvider: provider.name,
      model: request.model,
      fallbackUsed,
      fallbackChain: attempts,
      simulated,
      results,
      coldStart,
      summary,
      readinessScore,
      readinessBreakdown: {
        hardwareFit: hardwareFit === null ? null : Math.round(hardwareFit),
        latencyScore: Math.round(latencyScore),
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
      limitations: [
        ...limitations,
        ...privacy.limitations,
        ...hardware.limitations,
      ],
      privacy,
      hardware,
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
  model: string,
  hardware: HardwareFitAssessment,
  coldStart: ColdStart | null
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

  // Where the model physically sat. Read from the runtime immediately after
  // the run (/api/ps size and size_vram), so it is a measurement of this run
  // on this machine - not a calculation from the model's file size.
  if (hardware.state === 'FITS_GPU' || hardware.state === 'PARTIAL_OFFLOAD' || hardware.state === 'CPU_ONLY') {
    evidence.push(`${hardware.summary} (measured from the runtime.)`);
  }

  // Reported, never averaged. This is the one figure in the list that is
  // deliberately excluded from every number above it.
  if (coldStart !== null && coldStart.success) {
    const ttft =
      coldStart.ttft_ms === null
        ? ''
        : `, ${Math.round(coldStart.ttft_ms)} ms of it before the first token`;

    evidence.push(
      `Cold start: the discarded first call took ${Math.round(coldStart.latency_ms)} ms${ttft}. ${coldStart.note}`
    );
  }

  return evidence;
}

/**
 * Describes the discarded first call.
 *
 * The note is written from what was OBSERVED about residency, not from the
 * latency. A slow first call on an already-loaded model is a slow model; the
 * same latency on a model that was not loaded is a disk read. Only the probe
 * can tell those apart, and when it could not, this says so rather than
 * picking the more interesting explanation.
 */
function buildColdStart(
  warmup: MeasuredIteration | null,
  residentBefore: boolean | null
): ColdStart | null {
  if (warmup === null) {
    return null;
  }

  const note =
    residentBefore === false
      ? 'The model was not loaded when this run started, so this includes reading it into memory. It is excluded from every average above.'
      : residentBefore === true
        ? 'The model was already loaded, so this was not a cold load. It is excluded anyway, so that every run is measured the same way.'
        : 'Whether the model was already loaded could not be checked, so this first call is excluded either way.';

  return {
    latency_ms: warmup.latency_ms,
    ttft_ms: warmup.ttft_ms,
    success: warmup.success,
    error_code: warmup.error_code,
    model_was_resident_before: residentBefore,
    note,
  };
}

function buildAssumptions(
  unmeasured: UnmeasuredReadinessInputs,
  hardware: HardwareFitAssessment,
  simulated: boolean
): string[] {
  const assumptions: string[] = [];

  if (hardware.score === null) {
    assumptions.push(
      `Hardware fit was not assessed for this run (${hardware.state}). It is excluded from the readiness score rather than assumed, so the score is an average of the components that could be established.`
    );
  } else if (unmeasured.hardwareFit !== null && hardware.state === 'NOT_OBSERVED') {
    assumptions.push(
      `Hardware fit is assumed to be ${unmeasured.hardwareFit}/100 because it was supplied by the caller rather than measured.`
    );
  }

  assumptions.push(
    `Cost is assumed to be $${unmeasured.estimatedCostPer1kRequests} per 1000 requests. No cost model has been measured, so the cost component of the readiness score carries no evidence.`
  );

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
