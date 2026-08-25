/**
 * EdgePilot AI - readiness score
 *
 * Scores PERFORMANCE readiness from what was measured. Privacy is no longer a
 * term here.
 *
 * Privacy used to be a fifth weighted component: a coarse label mapped to
 * 30/60/100 and averaged in with latency and reliability. That let a fast
 * provider average away a data policy that should have ruled it out, and it
 * implied an arithmetic relationship between privacy levels that nobody can
 * defend. Privacy is now an ordinal class produced by PrivacyAssessor, which
 * annotates or disqualifies a recommendation instead of nudging a number.
 * See the header of that file for the reasoning.
 *
 * A component may be null, meaning "could not be assessed" - hardware fit on
 * a cloud provider, for instance, where the user's machine is irrelevant.
 * A null component is EXCLUDED and the remaining weights are renormalised
 * over their own sum, so the score always means "out of the things that could
 * be established here", and the limitations list says which those were.
 */

export interface ReadinessFactors {
  /** 0-100, or null when the device cannot be assessed (e.g. cloud). */
  hardwareFit: number | null;
  /** Measured mean latency, milliseconds. */
  latencyMs: number;
  /** USD per 1000 requests. */
  estimatedCost: number;
  /** 0-100. */
  reliabilityScore: number;
}

/**
 * Relative weights. They no longer sum to 1.0 because privacy left; the
 * calculator renormalises over whichever components are present, so the
 * absolute values matter only in proportion to each other.
 */
const WEIGHTS = {
  hardware: 0.25,
  latency: 0.2,
  cost: 0.15,
  reliability: 0.2,
} as const;

export class ReadinessCalculator {
  calculate(factors: ReadinessFactors): number {
    const latencyScore = Math.max(0, 100 - factors.latencyMs / 100);
    const costScore = Math.max(0, 100 - factors.estimatedCost * 1000);

    const parts: Array<readonly [number, number | null]> = [
      [WEIGHTS.hardware, factors.hardwareFit],
      [WEIGHTS.latency, latencyScore],
      [WEIGHTS.cost, costScore],
      [WEIGHTS.reliability, factors.reliabilityScore],
    ];

    const included = parts.filter(
      (entry): entry is readonly [number, number] =>
        entry[1] !== null && Number.isFinite(entry[1])
    );

    const totalWeight = included.reduce((sum, [weight]) => sum + weight, 0);

    // Nothing could be assessed. Zero is the only defensible answer, and the
    // caller's limitations list explains why.
    if (totalWeight === 0) {
      return 0;
    }

    const weighted = included.reduce(
      (sum, [weight, value]) => sum + weight * value,
      0
    );

    return Math.round(weighted / totalWeight);
  }

  /** Which components a given set of factors actually contributed. */
  assessable(factors: ReadinessFactors): string[] {
    const present = ['latency', 'cost', 'reliability'];

    if (factors.hardwareFit !== null) {
      present.unshift('hardware');
    }

    return present;
  }
}
