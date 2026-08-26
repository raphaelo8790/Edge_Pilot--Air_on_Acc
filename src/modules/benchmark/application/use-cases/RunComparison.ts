/**
 * EdgePilot AI - run a comparison
 *
 * Takes two or more entrants, decides whether they may be compared and how
 * they must be executed, runs them, and returns a per-dimension verdict.
 *
 * Two decisions worth knowing about.
 *
 * It does not persist. A comparison is an analysis of runs, not a new kind of
 * record, and making it depend on a workload row would tie a read-only
 * question to the write path. The individual outcomes come back in
 * full, so a caller that wants to store them can.
 *
 * It honours the plan's execution mode rather than always using Promise.all.
 * Two local models running at once contend for one GPU, and the numbers that
 * come back would describe that contention. See ComparisonPlanner.
 */

import type { ProviderRegistry } from '../../infrastructure/providers/ProviderRegistry';
import type { BenchmarkRunner, BenchmarkRunOutcome } from '../services/BenchmarkRunner';
import type { RecordedMeasurement } from '../dtos/BenchmarkRequest';
import type { ProviderTier } from '../../core/services/PrivacyAssessor';
import {
  planComparison,
  type ComparisonPlan,
} from '../../core/services/ComparisonPlanner';
import {
  buildComparisonReport,
  type ComparisonEntrantResult,
  type ComparisonReport,
} from '../../core/services/ComparisonReport';

export interface ComparisonEntrantRequest {
  provider: string;
  model: string;
  /** Declared billing tier for a cloud provider. */
  tier?: ProviderTier;
  /**
   * Families the runtime reports for this model, used to decide modality.
   * Supplied by the caller because only the caller knows how to ask each
   * runtime; absent families fall back to a labelled inference.
   */
  families?: string[];
  /**
   * Declared parameter count in billions, e.g. 7.2. Used only for the
   * normalised work-rate row; absent means that row is not computed for this
   * entrant rather than estimated.
   */
  parametersBillions?: number | null;
  /**
   * Present when the visitor's browser already measured this entrant against
   * its own Ollama. The server scores it instead of calling anything.
   */
  recorded?: RecordedMeasurement;
}

export interface RunComparisonRequest {
  entrants: ComparisonEntrantRequest[];
  prompt: string;
  iterations: number;
}

export interface RunComparisonFailure {
  ok: false;
  status: number;
  error: string;
  detail: string;
  /** Present when the refusal came from the plan rather than validation. */
  plan: ComparisonPlan | null;
}

export interface RunComparisonSuccess {
  ok: true;
  plan: ComparisonPlan;
  outcomes: Array<{
    label: string;
    outcome: BenchmarkRunOutcome;
    parametersBillions: number | null;
  }>;
  report: ComparisonReport;
}

export type RunComparisonResult = RunComparisonSuccess | RunComparisonFailure;

export interface RunComparisonDependencies {
  registry: ProviderRegistry;
  /** A fresh runner. Taken as a factory so each call gets clean state. */
  createRunner: () => BenchmarkRunner;
  /** A runner that replays a browser-recorded measurement. See RecordedProvider. */
  createRecordedRunner: (recorded: RecordedMeasurement) => BenchmarkRunner;
}

function label(provider: string, model: string): string {
  return `${provider} / ${model}`;
}

function toEntrantResult(
  entrantLabel: string,
  outcome: BenchmarkRunOutcome,
  parametersBillions: number | null
): ComparisonEntrantResult {
  // Per-iteration samples rather than the summarised mean: the report needs
  // the spread to decide whether a difference was demonstrated at all.
  const iterations = outcome.results ?? [];

  return {
    label: entrantLabel,
    latencySamples: iterations.map((iteration) => iteration.latency_ms),
    ttftSamples: iterations.map((iteration) => iteration.ttft_ms),
    throughputSamples: iterations.map((iteration) => iteration.tokens_per_second),
    successRatePercent: outcome.summary?.success_rate_percent ?? null,
    hardwareFit: outcome.hardware?.score ?? null,
    parametersBillions,
    residentBytes: outcome.hardware?.residentBytes ?? null,
    privacyClass: outcome.privacy?.privacyClass ?? null,
    privacyDisqualifies: outcome.privacy?.disqualifies ?? [],
    readinessScore: outcome.readinessScore ?? null,
  };
}

export class RunComparison {
  constructor(private readonly deps: RunComparisonDependencies) {}

  public async execute(
    request: RunComparisonRequest
  ): Promise<RunComparisonResult> {
    if (request.entrants.length < 2) {
      return {
        ok: false,
        status: 400,
        error: 'Not enough entrants',
        detail: 'A comparison needs at least two models.',
        plan: null,
      };
    }

    const unknown = request.entrants
      .map((entrant) => entrant.provider)
      .filter((provider) => !this.deps.registry.has(provider));

    if (unknown.length > 0) {
      return {
        ok: false,
        status: 404,
        error: 'Provider not registered',
        detail: `No adapter is registered under: ${Array.from(new Set(unknown)).join(', ')}.`,
        plan: null,
      };
    }

    const described = request.entrants.map((entrant) => {
      const metadata = this.deps.registry.get(entrant.provider)!.describe();

      return {
        ...entrant,
        providerType: metadata.type,
      };
    });

    const plan = planComparison(
      described.map((entrant) => ({
        provider: entrant.provider,
        providerType: entrant.providerType,
        model: entrant.model,
        families: entrant.families,
      }))
    );

    if (!plan.runnable) {
      return {
        ok: false,
        status: 422,
        error: 'Comparison refused',
        detail: plan.refusal ?? 'These entrants cannot be compared.',
        plan,
      };
    }

    const runOne = async (entrant: (typeof described)[number]) => {
      const runner = entrant.recorded
        ? this.deps.createRecordedRunner(entrant.recorded)
        : this.deps.createRunner();
      const outcome = await runner.run({
        provider: entrant.provider,
        model: entrant.model,
        prompt: request.prompt,
        iterations: request.iterations,
        tier: entrant.tier,
      });

      return {
        label: label(entrant.provider, entrant.model),
        outcome,
        parametersBillions: entrant.parametersBillions ?? null,
      };
    };

    let outcomes: Array<{
      label: string;
      outcome: BenchmarkRunOutcome;
      parametersBillions: number | null;
    }>;

    if (plan.mode === 'sequential') {
      outcomes = [];

      for (const entrant of described) {
        // Deliberately serial: see the plan's modeReason.
        outcomes.push(await runOne(entrant));
      }
    } else {
      outcomes = await Promise.all(described.map(runOne));
    }

    const report = buildComparisonReport(
      outcomes.map((entry) =>
        toEntrantResult(entry.label, entry.outcome, entry.parametersBillions)
      )
    );

    return { ok: true, plan, outcomes, report };
  }
}
