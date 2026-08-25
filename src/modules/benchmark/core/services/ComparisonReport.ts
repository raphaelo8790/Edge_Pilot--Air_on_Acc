/**
 * EdgePilot AI - comparison report
 *
 * Turns two or more completed runs into a per-dimension verdict: who won
 * where, by how much, and - the part most benchmark tools skip - whether the
 * difference was actually established or is inside the noise.
 *
 * THREE RULES.
 *
 * 1. A mean is not a fact. Every measured dimension is checked against the
 *    per-iteration samples behind it. If the two entrants' observed ranges
 *    overlap, no winner is declared. At five iterations a 10% gap in means
 *    routinely sits inside a 3x spread; reporting it as a win is inventing a
 *    result.
 *
 * 2. A derived dimension cannot be more certain than what it derives from.
 *    Readiness is a weighted average of latency, hardware fit, cost and
 *    reliability. If none of those differed in an established way, the
 *    readiness gap is those same undemonstrated differences laundered through
 *    an average - and must not be stamped established. This is not
 *    hypothetical: a real run produced "latency: not established" and
 *    "readiness: established" in the same table, three rows apart, where the
 *    entire readiness gap WAS the latency gap divided by four.
 *
 * 3. Normalised metrics answer a different question, not a fairer one.
 *    Dividing throughput by parameter count asks "which model works the
 *    hardware harder", and it can invert the raw result. That is useful, but
 *    it implicitly treats parameters as a proxy for value, and they are not:
 *    a larger model is not automatically producing better output. Both are
 *    reported, each labelled with the question it answers, and neither is
 *    presented as the corrected version of the other.
 *
 * 4. "Not established" has two very different meanings, and saying the wrong
 *    one wastes the reader's time. Sometimes the entrants are close and more
 *    iterations really would settle it. Sometimes the run-to-run spread
 *    dwarfs the gap - a real pair of local models produced latency varying
 *    4.6x within each model against a 17% difference between them, and going
 *    from three iterations to ten moved nothing. Telling that reader to "run
 *    more iterations" is advice that will never pay off. The two cases are
 *    separated by comparing the gap to the spread.
 */

import { PRIVACY_CLASS_RANK, type PrivacyClass } from './PrivacyAssessor';

export interface ComparisonEntrantResult {
  /** How this entrant is named in the report, e.g. "ollama / mistral:7b". */
  label: string;
  /** Per-iteration latencies, in milliseconds. The source of the ranges. */
  latencySamples: number[];
  /** Per-iteration time-to-first-token. Nulls are providers that cannot report it. */
  ttftSamples: Array<number | null>;
  /** Per-iteration throughput. */
  throughputSamples: Array<number | null>;
  successRatePercent: number | null;
  /** Null for cloud, where the user's hardware is irrelevant. */
  hardwareFit: number | null;
  /** Declared parameter count in billions, e.g. 7.2. Null when unknown. */
  parametersBillions: number | null;
  /** Bytes resident while loaded, for memory efficiency. Null when unknown. */
  residentBytes: number | null;
  privacyClass: PrivacyClass | null;
  privacyDisqualifies: string[];
  readinessScore: number | null;
}

/**
 * Why a dimension ended up where it did. Machine-readable so a UI can style
 * "too noisy to tell" differently from "nearly a tie".
 */
export type VerdictCode =
  | 'established'
  | 'identical'
  | 'insufficient-data'
  | 'no-samples'
  | 'overlap-close'
  | 'overlap-indistinguishable'
  | 'derived-unproven';

export interface DimensionVerdict {
  dimension: string;
  label: string;
  code: VerdictCode;
  /** The question this dimension answers, shown beside it. */
  question: string;
  betterIs: 'higher' | 'lower';
  values: Array<{ label: string; value: number | null }>;
  winner: string | null;
  margin: string | null;
  established: boolean;
  note: string | null;
  /**
   * Gap between the two best values as a share of the average within-model
   * spread. Below ~0.15 the difference is buried in noise. Null when no
   * samples were available.
   */
  separability: number | null;
  /** True for values computed from other dimensions rather than measured. */
  derived: boolean;
}

/**
 * Below this, the gap between averages is small enough relative to each
 * model's own run-to-run spread that more sampling is not going to separate
 * them. It is a heuristic, not a significance test - a Welch t-test or a
 * bootstrap interval would be the rigorous version, and both assume more
 * about the distribution than skewed latency data supports. The point here is
 * only to tell "close" apart from "hopeless", which this does honestly.
 */
const INDISTINGUISHABLE_RATIO = 0.15;

export interface ComparisonReport {
  dimensions: DimensionVerdict[];
  overall: {
    winner: string | null;
    tally: Record<string, number>;
    established: number;
    summary: string;
  };
  privacyNotes: string[];
  /** Things the reader must know to interpret the table correctly. */
  methodNotes: string[];
}

function mean(samples: Array<number | null>): number | null {
  const usable = samples.filter((s): s is number => typeof s === 'number');
  return usable.length === 0
    ? null
    : usable.reduce((a, b) => a + b, 0) / usable.length;
}

function span(samples: Array<number | null>): [number, number] | null {
  const usable = samples.filter((s): s is number => typeof s === 'number');
  return usable.length === 0
    ? null
    : [Math.min(...usable), Math.max(...usable)];
}

interface DimensionInput {
  dimension: string;
  label: string;
  question: string;
  betterIs: 'higher' | 'lower';
  unit?: string;
  derived?: boolean;
  /** Per-entrant samples, when the dimension was measured repeatedly. */
  samplesOf?: (entrant: ComparisonEntrantResult) => Array<number | null>;
  valueOf: (entrant: ComparisonEntrantResult) => number | null;
  /**
   * Dimensions this one is computed from. It can never be more established
   * than the most established of them.
   */
  dependsOn?: string[];
}

function buildDimension(
  spec: DimensionInput,
  entrants: ComparisonEntrantResult[],
  decided: Map<string, DimensionVerdict>
): DimensionVerdict {
  const values = entrants.map((entrant) => ({
    label: entrant.label,
    value: spec.valueOf(entrant),
  }));

  const base = {
    dimension: spec.dimension,
    label: spec.label,
    question: spec.question,
    betterIs: spec.betterIs,
    values,
    separability: null,
    derived: spec.derived ?? false,
  };

  const usable = values.filter(
    (entry): entry is { label: string; value: number } => entry.value !== null
  );

  if (usable.length < 2) {
    return {
      ...base,
      code: usable.length === 0 ? 'no-samples' : 'insufficient-data',
      winner: null,
      margin: null,
      established: false,
      note:
        usable.length === 0
          ? 'Not reported by any entrant.'
          : 'Only one entrant reported this, so there is nothing to compare.',
    };
  }

  const sorted = [...usable].sort((a, b) =>
    spec.betterIs === 'higher' ? b.value - a.value : a.value - b.value
  );
  const best = sorted[0];
  const runnerUp = sorted[1];

  if (best.value === runnerUp.value) {
    return {
      ...base,
      code: 'identical',
      winner: null,
      margin: null,
      established: false,
      note: 'Identical values; no winner.',
    };
  }

  const unit = spec.unit ?? '';
  const ratio =
    spec.betterIs === 'higher'
      ? best.value / runnerUp.value
      : runnerUp.value / best.value;
  const percent = Math.round((ratio - 1) * 100);
  const margin =
    percent > 0
      ? `${percent}% ${spec.betterIs === 'lower' ? 'lower' : 'higher'} (${best.value.toFixed(1)}${unit} vs ${runnerUp.value.toFixed(1)}${unit})`
      : `${best.value.toFixed(1)}${unit} vs ${runnerUp.value.toFixed(1)}${unit}`;

  // Rule 1: overlapping observed ranges mean nothing was shown.
  if (spec.samplesOf) {
    const a = entrants.find((e) => e.label === best.label)!;
    const b = entrants.find((e) => e.label === runnerUp.label)!;
    const spanA = span(spec.samplesOf(a));
    const spanB = span(spec.samplesOf(b));

    if (!spanA || !spanB) {
      return {
        ...base,
        code: 'no-samples',
        winner: best.label,
        margin,
        established: false,
        note: 'No per-iteration samples were available, so run-to-run variance could not be checked.',
      };
    }

    if (spanA[0] <= spanB[1] && spanB[0] <= spanA[1]) {
      const gap = Math.abs(best.value - runnerUp.value);
      const spread = ((spanA[1] - spanA[0]) + (spanB[1] - spanB[0])) / 2;
      const separability = spread > 0 ? gap / spread : Number.POSITIVE_INFINITY;

      const observed =
        `${best.label} averaged better (${best.value.toFixed(1)}${unit} vs ${runnerUp.value.toFixed(1)}${unit}), ` +
        `but the observed ranges overlap — ${spanA[0].toFixed(0)}–${spanA[1].toFixed(0)} against ` +
        `${spanB[0].toFixed(0)}–${spanB[1].toFixed(0)}${unit}.`;

      if (separability < INDISTINGUISHABLE_RATIO) {
        return {
          ...base,
          code: 'overlap-indistinguishable',
          separability,
          winner: null,
          margin: null,
          established: false,
          note:
            `${observed} The gap between the averages is ${(separability * 100).toFixed(0)}% of the ` +
            'run-to-run spread within each model, so this is variance rather than a close call. ' +
            'More iterations will not separate them on this metric — treat the two as ' +
            'indistinguishable here and decide on a dimension that does separate them.',
        };
      }

      return {
        ...base,
        code: 'overlap-close',
        separability,
        winner: null,
        margin: null,
        established: false,
        note:
          `${observed} The gap is ${(separability * 100).toFixed(0)}% of the run-to-run spread, ` +
          'which is close rather than buried in noise — more iterations would likely settle it.',
      };
    }
  }

  // Rule 2: a derived dimension inherits the certainty of its inputs.
  if (spec.dependsOn && spec.dependsOn.length > 0) {
    const inputs = spec.dependsOn
      .map((name) => decided.get(name))
      .filter((verdict): verdict is DimensionVerdict => verdict !== undefined);

    const anyEstablished = inputs.some((verdict) => verdict.established);

    if (!anyEstablished) {
      const names = inputs.map((verdict) => verdict.label.toLowerCase()).join(', ');

      return {
        ...base,
        code: 'derived-unproven',
        winner: null,
        margin: null,
        established: false,
        note:
          `${best.label} scores higher, but this is computed from ${names}, and none of those ` +
          'showed an established difference. The gap here is that same unproven difference ' +
          'passed through an average, so it is not a result on its own.',
      };
    }
  }

  return {
    ...base,
    code: 'established',
    winner: best.label,
    margin,
    established: true,
    note: null,
  };
}

export function buildComparisonReport(
  entrants: ComparisonEntrantResult[]
): ComparisonReport {
  const specs: DimensionInput[] = [
    {
      dimension: 'latency',
      label: 'Mean latency',
      question: 'How long does one complete answer take?',
      betterIs: 'lower',
      unit: ' ms',
      samplesOf: (e) => e.latencySamples,
      valueOf: (e) => mean(e.latencySamples),
    },
    {
      dimension: 'ttft',
      label: 'Time to first token',
      question: 'How quickly does it start responding?',
      betterIs: 'lower',
      unit: ' ms',
      samplesOf: (e) => e.ttftSamples,
      valueOf: (e) => mean(e.ttftSamples),
    },
    {
      dimension: 'throughput',
      label: 'Tokens per second',
      question: 'How fast does it produce text once started?',
      betterIs: 'higher',
      unit: ' tok/s',
      samplesOf: (e) => e.throughputSamples,
      valueOf: (e) => mean(e.throughputSamples),
    },
    {
      dimension: 'throughput_per_parameter',
      label: 'Work rate (B params × tok/s)',
      question:
        'Which model works the hardware hardest? Not a quality measure — parameter count is not a proxy for output quality.',
      betterIs: 'higher',
      derived: true,
      dependsOn: ['throughput'],
      valueOf: (e) => {
        const t = mean(e.throughputSamples);
        return t === null || e.parametersBillions === null
          ? null
          : t * e.parametersBillions;
      },
    },
    {
      dimension: 'throughput_per_gb',
      label: 'Throughput per GB resident',
      question: 'How much speed does each gigabyte of memory buy?',
      betterIs: 'higher',
      unit: ' tok/s/GB',
      derived: true,
      dependsOn: ['throughput'],
      valueOf: (e) => {
        const t = mean(e.throughputSamples);
        return t === null || e.residentBytes === null || e.residentBytes <= 0
          ? null
          : t / (e.residentBytes / 1e9);
      },
    },
    {
      dimension: 'reliability',
      label: 'Successful requests',
      question: 'How often did a request complete at all?',
      betterIs: 'higher',
      unit: '%',
      valueOf: (e) => e.successRatePercent,
    },
    {
      dimension: 'hardware',
      label: 'Hardware fit',
      question: 'Did the model fit this machine, with room to spare?',
      betterIs: 'higher',
      valueOf: (e) => e.hardwareFit,
    },
    {
      dimension: 'readiness',
      label: 'Readiness',
      question: 'Overall performance readiness from the measured components.',
      betterIs: 'higher',
      derived: true,
      dependsOn: ['latency', 'hardware', 'reliability'],
      valueOf: (e) => e.readinessScore,
    },
  ];

  const decided = new Map<string, DimensionVerdict>();
  const dimensions: DimensionVerdict[] = [];

  for (const spec of specs) {
    const verdict = buildDimension(spec, entrants, decided);
    decided.set(spec.dimension, verdict);
    dimensions.push(verdict);
  }

  const tally: Record<string, number> = {};

  for (const entrant of entrants) {
    tally[entrant.label] = 0;
  }

  // Only measured dimensions count toward the tally. Derived ones are shown
  // because they are informative, but counting them would double-count the
  // measurement they came from.
  let established = 0;

  for (const dimension of dimensions) {
    if (dimension.established && dimension.winner && !dimension.derived) {
      established += 1;
      tally[dimension.winner] = (tally[dimension.winner] ?? 0) + 1;
    }
  }

  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const clearWinner =
    ranked.length > 1 && ranked[0][1] > ranked[1][1] ? ranked[0][0] : null;

  const summary =
    established === 0
      ? 'No measured dimension produced an established difference. On this evidence the entrants are not distinguishable.'
      : clearWinner
        ? `${clearWinner} won ${tally[clearWinner]} of ${established} established measured dimensions.`
        : `Honours were even across ${established} established measured dimension(s); no overall winner.`;

  const methodNotes: string[] = [
    'A winner is declared only where the entrants’ observed per-iteration ranges do not overlap. Overlapping ranges mean the difference was not demonstrated, however different the averages look.',
    'Derived rows (work rate, throughput per GB, readiness) are shown for insight but are excluded from the tally, and cannot be more certain than the measurements they come from.',
  ];

  const buriedInNoise = dimensions.filter(
    (dimension) => dimension.code === 'overlap-indistinguishable'
  );

  if (buriedInNoise.length > 0) {
    methodNotes.push(
      `${buriedInNoise.map((d) => d.label.toLowerCase()).join(', ')} varied more between runs of the same model ` +
        'than between the two models. Those are not close calls that more iterations would resolve — on this ' +
        'hardware they simply do not distinguish these entrants, and a decision should rest on the dimensions that do.'
    );
  }

  const normalised = dimensions.find(
    (d) => d.dimension === 'throughput_per_parameter'
  );
  const raw = dimensions.find((d) => d.dimension === 'throughput');

  if (
    normalised?.winner &&
    raw?.winner &&
    normalised.winner !== raw.winner
  ) {
    methodNotes.push(
      `Raw throughput favours ${raw.winner}, but per-parameter work rate favours ${normalised.winner}. ` +
        'Both are true: the first model produces text faster, the second does more computation per second. ' +
        'Which matters depends on whether you are buying speed or utilisation — and parameter count is not a measure of answer quality.'
    );
  }

  const privacyNotes: string[] = [];
  const classed = entrants.filter((entrant) => entrant.privacyClass !== null);

  if (classed.length >= 2) {
    const bestPrivacy = [...classed].sort(
      (a, b) =>
        PRIVACY_CLASS_RANK[a.privacyClass!] - PRIVACY_CLASS_RANK[b.privacyClass!]
    )[0];
    const distinct = new Set(classed.map((entrant) => entrant.privacyClass));

    privacyNotes.push(
      distinct.size === 1
        ? `All entrants share the same privacy class: ${classed[0].privacyClass}.`
        : `Best privacy class: ${bestPrivacy.label} (${bestPrivacy.privacyClass}).`
    );
  }

  for (const entrant of entrants) {
    if (entrant.privacyDisqualifies.length > 0) {
      privacyNotes.push(
        `${entrant.label} fails: ${entrant.privacyDisqualifies.join(', ')}. ` +
          'If that requirement applies, no performance result makes this option viable.'
      );
    }
  }

  return {
    dimensions,
    overall: { winner: clearWinner, tally, established, summary },
    privacyNotes,
    methodNotes,
  };
}
