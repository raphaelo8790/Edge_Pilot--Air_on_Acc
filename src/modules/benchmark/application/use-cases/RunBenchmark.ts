/**
 * The benchmark use case: validate the referenced rows, run the measurement,
 * persist it, and return the typed envelope.
 *
 * Two decisions in here are worth reading before changing anything.
 *
 * 1. WHERE `userId` COMES FROM.
 *    Ownership is derived from the workload the request names:
 *    `workloads.user_id` is required and the benchmark is about that
 *    workload. This began as an interim rule while there was no session, and
 *    survives now that there is one because it is still the right answer — a
 *    benchmark belongs to whoever owns the thing being benchmarked, and the
 *    workload row is already owned by the session that created it.
 *
 *    This used to also resolve a device row and refuse the request when the
 *    workload and the device had different owners. Devices are gone: the row
 *    carried nothing any measurement read, and the hand-typed specifications
 *    behind it were never an input to anything. Placement now comes from
 *    what the runtime actually reports. See HardwareFitAssessor.
 *
 * 2. WHY A DATABASE FAILURE DOES NOT LOSE THE RUN.
 *    The measurement is the expensive part and it has already happened by the
 *    time persistence is attempted. If the write fails, the run is still
 *    returned with `persisted: false` and a limitation saying so, rather than
 *    a 500 that throws away real evidence.
 */

import type { BenchmarkRepository } from '../../core/ports/BenchmarkRepository';
import type { BenchmarkRequest } from '../dtos/BenchmarkRequest';
import type { BenchmarkRun } from '../dtos/BenchmarkMeasurement';
import type {
  BenchmarkRunner,
  UnmeasuredReadinessInputs,
} from '../services/BenchmarkRunner';
import { providerErrorStatus } from '../../infrastructure/providers/errors';

/**
 * The rows this use case must resolve before it will call a provider. Kept
 * as a narrow port so the use case can be tested without a database.
 */
export interface BenchmarkContextGateway {
  /** The owner of the workload, or null when the workload does not exist. */
  resolveContext(workloadId: string): Promise<{
    workloadUserId: string | null;
  }>;

  /** providers.id for a slug, or null when the catalog has no such row. */
  resolveProviderId(slug: string): Promise<string | null>;
}

export interface RunBenchmarkFailure {
  ok: false;
  status: number;
  error: string;
  detail: string;
}

export interface RunBenchmarkSuccess {
  ok: true;
  run: BenchmarkRun;
}

export type RunBenchmarkOutcome = RunBenchmarkSuccess | RunBenchmarkFailure;

export interface RunBenchmarkDependencies {
  repository: BenchmarkRepository;
  runner: BenchmarkRunner;
  context: BenchmarkContextGateway;
  /** Injected so tests do not depend on the wall clock. */
  now?: () => Date;
  unmeasured?: Partial<UnmeasuredReadinessInputs>;
}

export class RunBenchmark {
  private readonly repository: BenchmarkRepository;
  private readonly runner: BenchmarkRunner;
  private readonly context: BenchmarkContextGateway;
  private readonly now: () => Date;
  private readonly unmeasured: Partial<UnmeasuredReadinessInputs>;

  constructor(dependencies: RunBenchmarkDependencies) {
    this.repository = dependencies.repository;
    this.runner = dependencies.runner;
    this.context = dependencies.context;
    this.now = dependencies.now ?? (() => new Date());
    this.unmeasured = dependencies.unmeasured ?? {};
  }

  public async execute(
    request: BenchmarkRequest
  ): Promise<RunBenchmarkOutcome> {
    const startedAt = this.now();

    // ---- 1. Resolve the referenced rows BEFORE calling any provider. -------
    // A request naming a workload that does not exist is a client error, and
    // finding that out after spending sixty seconds on inference would be
    // both slow and confusing.
    let context: { workloadUserId: string | null };
    let providerId: string | null;

    try {
      context = await this.context.resolveContext(request.workload_id);
      providerId = await this.context.resolveProviderId(request.provider);
    } catch (error) {
      return {
        ok: false,
        status: 503,
        error: 'Database unavailable',
        detail:
          'Could not read the workload or provider catalog. ' +
          describeError(error),
      };
    }

    if (context.workloadUserId === null) {
      return {
        ok: false,
        status: 404,
        error: 'Workload not found',
        detail: `No workload with id ${request.workload_id}.`,
      };
    }

    if (providerId === null) {
      return {
        ok: false,
        status: 404,
        error: 'Provider not found',
        detail: `The provider catalog has no row named "${request.provider}". Run \`npm run db:seed\`.`,
      };
    }

    const userId = context.workloadUserId;

    // ---- 2. Create the benchmark row, so a run in flight is visible. -------
    let benchmarkId: string | null = null;

    try {
      const created = await this.repository.create({
        workloadId: request.workload_id,
        providerId,
        model: request.model,
        prompt: request.prompt,
        iterations: request.iterations,
        status: 'running',
        userId,
      });

      benchmarkId = created.id;
    } catch (error) {
      // Not fatal: measure anyway and report persisted: false.
      benchmarkId = null;
      this.warn('Could not create the benchmark row', error);
    }

    // ---- 3. Measure. ------------------------------------------------------
    const outcome = await this.runner.run({
      provider: request.provider,
      model: request.model,
      prompt: request.prompt,
      iterations: request.iterations,
      unmeasured: this.unmeasured,
    });

    const completedAt = this.now();
    const status: BenchmarkRun['status'] =
      outcome.effectiveProvider === null ? 'failed' : 'completed';

    // ---- 4. Persist what was measured. ------------------------------------
    let persisted = false;

    if (benchmarkId !== null) {
      try {
        // The discarded first call is stored too, flagged, at iteration 0.
        // It is evidence - "this model takes 36 s to become usable" is worth
        // reading back later - but the flag is what keeps it out of anything
        // that averages.
        if (outcome.coldStart !== null) {
          await this.repository.addResult({
            benchmarkId,
            iteration: 0,
            latencyMs: outcome.coldStart.latency_ms,
            tokensPerSecond: null,
            ttftMs: outcome.coldStart.ttft_ms,
            success: outcome.coldStart.success,
            errorMessage: null,
            warmup: true,
          });
        }

        for (let index = 0; index < outcome.results.length; index += 1) {
          const result = outcome.results[index];

          await this.repository.addResult({
            benchmarkId,
            iteration: result.iteration,
            latencyMs: result.latency_ms,
            tokensPerSecond: result.tokens_per_second,
            ttftMs: result.ttft_ms,
            success: result.success,
            errorMessage: result.error_message,
            warmup: false,
          });
        }

        if (
          outcome.readinessScore !== null &&
          outcome.readinessBreakdown !== null
        ) {
          await this.repository.addReadinessScore({
            benchmarkId,
            hardwareFit: outcome.readinessBreakdown.hardwareFit,
            latencyScore: outcome.readinessBreakdown.latencyScore,
            // Privacy is no longer a component of the score. The class is
            // recorded alongside it so a row read back later still says what
            // happened to the content.
            privacyScore: null,
            privacyClass: outcome.privacy?.privacyClass ?? null,
            costScore: outcome.readinessBreakdown.costScore,
            reliabilityScore: outcome.readinessBreakdown.reliabilityScore,
            overallReadiness: outcome.readinessScore,
            recommendation: outcome.recommendation,
            // Assumptions ride with the score in the evidence column, tagged,
            // because a score read out of the database later must still say
            // which of its inputs nobody measured.
            evidence: outcome.evidence,
            limitations: outcome.limitations.concat(
              outcome.assumptions.map(
                (assumption) => `ASSUMPTION: ${assumption}`
              )
            ),
          });
        }

        await this.repository.update(benchmarkId, {
          status,
          completedAt,
        });

        persisted = true;
      } catch (error) {
        this.warn('Could not persist the benchmark results', error);
        persisted = false;
      }
    }

    const limitations = outcome.limitations.slice();

    limitations.push(
      'Ownership is derived from workloads.user_id, not from an authenticated session. ' +
        'This is an interim rule until session handling lands.'
    );

    if (!persisted) {
      limitations.push(
        'This run was NOT written to the database. The figures below are real but they are not stored, ' +
          'and they will not appear in the history.'
      );
    }

    const run: BenchmarkRun = {
      benchmark_id: benchmarkId ?? 'not-persisted',
      status,
      requested_provider: outcome.requestedProvider,
      effective_provider: outcome.effectiveProvider,
      model: outcome.model,
      fallback_used: outcome.fallbackUsed,
      fallback_chain: outcome.fallbackChain,
      simulated: outcome.simulated,
      results: outcome.results,
      cold_start: outcome.coldStart,
      summary: outcome.summary,
      readiness_score: outcome.readinessScore,
      recommendation: outcome.recommendation,
      evidence: outcome.evidence,
      assumptions: outcome.assumptions,
      limitations,
      persisted,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
    };

    return { ok: true, run };
  }

  private warn(message: string, error: unknown): void {
    console.warn(`[benchmark] ${message}: ${describeError(error)}`);
  }
}

/**
 * The HTTP status for a run where every provider failed. The run itself is
 * still returned in the body — it carries the fallback chain, which is what
 * an operator needs to see.
 */
export function statusForFailedRun(run: BenchmarkRun): number {
  const lastAttempt = run.fallback_chain[run.fallback_chain.length - 1];

  if (lastAttempt?.error_code) {
    return providerErrorStatus(lastAttempt.error_code);
  }

  return 502;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
