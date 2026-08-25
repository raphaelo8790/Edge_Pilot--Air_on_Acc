/**
 * EdgePilot AI - privacy assessment
 *
 * Privacy is reported as a CLASS, not as a number, and it is deliberately not
 * averaged into the readiness score.
 *
 * Why. The original design mapped a hand-written label to 30/60/100 and mixed
 * the result into a weighted average with latency and reliability. That is a
 * category error twice over. First, 30 versus 60 implies an arithmetic
 * relationship that nobody can defend - a vendor is not "twice as private" as
 * another. Second, blending throughput with legal exposure lets a fast
 * provider average away a data policy that should have disqualified it
 * outright. A team that cannot let data leave the building does not want a
 * blended 61; they want to know the option is unavailable.
 *
 * So: readiness scores performance from what was measured, and privacy is a
 * separate, ordinal class that annotates or disqualifies the recommendation.
 *
 * The class is built from two kinds of input, which are never mixed:
 *
 *   Observed  - where the request actually went, and whether it was
 *               encrypted. Derived from the endpoint URL of the run that
 *               happened. A fact about the request, not a claim.
 *
 *   Cited     - retention, training on input, human review, jurisdiction.
 *               Read from a provider's terms, carrying a source URL and the
 *               date checked. No probe returns these.
 *
 *   Declared  - the billing tier, which materially changes the cited facts.
 *               No inference API reports it, so it is asked for.
 *
 * When the vendor's terms have not been verified, the class still states what
 * is known - the content left the machine and reached a vendor - and marks
 * `termsVerified: false` rather than inventing what the vendor does with it.
 */

/** Where the request ended up, relative to the user's machine. */
export type Egress = 'none' | 'local-network' | 'internet';

/**
 * Billing tier. Materially changes data-use terms for most cloud providers:
 * a free tier commonly permits training on input where a paid tier does not.
 * No inference API reports this, so it is declared by the user.
 */
export type ProviderTier = 'local' | 'free' | 'paid' | 'unknown';

export type PrivacyProvenance = 'observed' | 'declared' | 'cited' | 'unverified';

/**
 * Ordinal privacy classes, best first. Comparable by `rank`; never averaged.
 */
export type PrivacyClass =
  | 'on-device'
  | 'local-network'
  | 'vendor-processed'
  | 'vendor-processed-trains-on-input';

export const PRIVACY_CLASS_RANK: Record<PrivacyClass, number> = {
  'on-device': 0,
  'local-network': 1,
  'vendor-processed': 2,
  'vendor-processed-trains-on-input': 3,
};

export const PRIVACY_CLASS_LABEL: Record<PrivacyClass, string> = {
  'on-device': 'On device',
  'local-network': 'Local network',
  'vendor-processed': 'Processed by vendor',
  'vendor-processed-trains-on-input': 'Processed by vendor, trains on input',
};

/** Requirements a class fails outright, for the recommendation to cite. */
export const PRIVACY_DISQUALIFIERS: Record<PrivacyClass, string[]> = {
  'on-device': [],
  'local-network': ['data-must-not-leave-this-machine'],
  'vendor-processed': [
    'data-must-not-leave-this-machine',
    'data-must-not-leave-your-network',
  ],
  'vendor-processed-trains-on-input': [
    'data-must-not-leave-this-machine',
    'data-must-not-leave-your-network',
    'content-must-not-train-third-party-models',
  ],
};

/** A policy fact that must carry its source and the date it was checked. */
export interface CitedFact<T> {
  value: T | null;
  provenance: PrivacyProvenance;
  source: string | null;
  asOf: string | null;
  note?: string;
}

export function unverified<T>(source: string | null, note?: string): CitedFact<T> {
  return { value: null, provenance: 'unverified', source, asOf: null, note };
}

/** The cited half of a provider's privacy position, for one tier. */
export interface PrivacyPolicyFacts {
  /** Days the provider retains prompt content. 0 means not retained. */
  retentionDays: CitedFact<number>;
  /** Whether submitted content may be used to train models. */
  trainsOnInput: CitedFact<boolean>;
  /** Whether humans may review submitted content. */
  humanReview: CitedFact<boolean>;
  /** Where processing happens, e.g. "US", "EU". */
  jurisdiction: CitedFact<string>;
}

/** The observed half: what actually happened on the wire. */
export interface ObservedTransport {
  endpointUrl: string | null;
  egress: Egress;
  transportEncrypted: boolean | null;
}

export interface PrivacyAssessment {
  /** The headline. Ordinal, never averaged into the readiness score. */
  privacyClass: PrivacyClass;
  /** Human-readable label for the class. */
  label: string;
  /** 0 is best. For sorting providers, not for arithmetic. */
  rank: number;
  /** False when the vendor's terms have not been checked for this tier. */
  termsVerified: boolean;
  tier: ProviderTier;
  transport: ObservedTransport;
  facts: PrivacyPolicyFacts | null;
  /** Requirements this option fails outright. */
  disqualifies: string[];
  /** What could not be established, and why. */
  limitations: string[];
  /** One line suitable for showing beside the class. */
  summary: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Classifies where a request went from the endpoint URL.
 *
 * Loopback is the only case where content provably never left the machine.
 * A private-range address means it left the machine but stayed on the local
 * network - a real third state, and not the same as sending it to a vendor.
 *
 * Fails closed: an absent or unparseable endpoint is treated as internet.
 */
export function classifyEgress(endpointUrl: string | null): Egress {
  if (!endpointUrl) {
    return 'internet';
  }

  let host: string;

  try {
    host = new URL(endpointUrl).hostname.toLowerCase();
  } catch {
    return 'internet';
  }

  if (LOOPBACK_HOSTS.has(host) || host.startsWith('127.')) {
    return 'none';
  }

  const privateRanges = [
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^169\.254\./,
    /^fc[0-9a-f]{2}:/,
    /^fd[0-9a-f]{2}:/,
    /\.local$/,
  ];

  return privateRanges.some((r) => r.test(host)) ? 'local-network' : 'internet';
}

export function observeTransport(endpointUrl: string | null): ObservedTransport {
  let transportEncrypted: boolean | null = null;

  if (endpointUrl) {
    try {
      transportEncrypted = new URL(endpointUrl).protocol === 'https:';
    } catch {
      transportEncrypted = null;
    }
  }

  return {
    endpointUrl,
    egress: classifyEgress(endpointUrl),
    transportEncrypted,
  };
}

function factsAreVerified(facts: PrivacyPolicyFacts | null): boolean {
  if (!facts) {
    return false;
  }

  // Training on input is the fact the class hinges on. Without it the vendor's
  // handling is unknown regardless of what else has been checked.
  return facts.trainsOnInput.provenance === 'cited' &&
    facts.trainsOnInput.value !== null;
}

/**
 * Produces the privacy class for one run.
 *
 * @param endpointUrl  the URL the request was actually sent to
 * @param tier         the billing tier the user declared for this provider
 * @param facts        cited policy facts for that provider and tier, if any
 */
export function assessPrivacy(
  endpointUrl: string | null,
  tier: ProviderTier,
  facts: PrivacyPolicyFacts | null
): PrivacyAssessment {
  const transport = observeTransport(endpointUrl);
  const limitations: string[] = [];

  const build = (
    privacyClass: PrivacyClass,
    termsVerified: boolean,
    summary: string
  ): PrivacyAssessment => ({
    privacyClass,
    label: PRIVACY_CLASS_LABEL[privacyClass],
    rank: PRIVACY_CLASS_RANK[privacyClass],
    termsVerified,
    tier,
    transport,
    facts,
    disqualifies: PRIVACY_DISQUALIFIERS[privacyClass],
    limitations,
    summary,
  });

  // Content that never left the machine cannot be retained, trained on or
  // reviewed by anyone. This is the only class establishable from observation
  // alone, and it needs no vendor terms at all.
  if (transport.egress === 'none') {
    limitations.push(
      'Retention, training and human-review do not apply: the request never left this machine.'
    );

    return build(
      'on-device',
      true,
      'Content stayed on this machine. Observed from the endpoint, not assumed.'
    );
  }

  if (transport.transportEncrypted === false) {
    limitations.push(
      'Transport was not encrypted (http). Content was readable in transit by anything on the path.'
    );
  }

  if (transport.egress === 'local-network') {
    limitations.push(
      'The request left this machine but stayed on the local network. Whoever administers that network can observe it.'
    );

    return build(
      'local-network',
      true,
      'Content left this machine but stayed on your network.'
    );
  }

  if (tier === 'unknown') {
    limitations.push(
      'Billing tier was not declared. Free and paid tiers usually differ on retention and training, so the vendor terms below may not describe your key.'
    );
  }

  if (!factsAreVerified(facts)) {
    limitations.push(
      'This vendor’s data-handling terms have not been verified for the declared tier, so what happens to the content after it arrives is unknown.'
    );

    return build(
      'vendor-processed',
      false,
      'Content left your machine and reached a vendor. Their terms have not been verified.'
    );
  }

  const trains = facts!.trainsOnInput.value === true;

  if (facts!.retentionDays.value === null) {
    limitations.push('Retention period is unverified for this provider and tier.');
  }

  if (facts!.humanReview.value === null) {
    limitations.push(
      'Whether humans may review submitted content is unverified for this provider and tier.'
    );
  } else if (facts!.humanReview.value === true) {
    limitations.push('This vendor states that humans may review submitted content.');
  }

  return build(
    trains ? 'vendor-processed-trains-on-input' : 'vendor-processed',
    true,
    trains
      ? 'Content left your machine and this vendor may use it to train models.'
      : 'Content left your machine. This vendor states it does not train on input.'
  );
}
