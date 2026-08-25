/**
 * EdgePilot AI - provider data-policy catalogue
 *
 * Cited privacy facts, keyed by provider slug and billing tier.
 *
 * EVERY VALUE HERE STARTS AS null AND UNVERIFIED, ON PURPOSE.
 *
 * These are policy facts, not measurements. They come from a provider's terms
 * of service, they differ between free and paid tiers, and they change without
 * notice. Filling them in from memory - human or model - is how a tool that
 * claims to be evidence-based starts publishing stale claims with confidence.
 *
 * To verify one:
 *   1. Open the `source` URL below.
 *   2. Read the current terms for that specific tier.
 *   3. Set `value`, set `provenance` to 'cited', set `asOf` to today's date.
 *   4. Quote the relevant clause in `note` so the next person can check you.
 *
 * Until then `assessPrivacy` returns null for that provider, which is the
 * honest answer and is rendered as "not scored", not as zero.
 *
 * Re-verification: anything older than about six months should be treated as
 * suspect. The dashboard shows `asOf` next to the score for exactly this
 * reason.
 */

import {
  PrivacyPolicyFacts,
  ProviderTier,
  unverified,
} from './PrivacyAssessor';

const GEMINI_TERMS = 'https://ai.google.dev/gemini-api/terms';
const GROQ_PRIVACY = 'https://groq.com/privacy-policy/';

function blankFacts(source: string | null): PrivacyPolicyFacts {
  return {
    retentionDays: unverified<number>(source, 'Not yet verified.'),
    trainsOnInput: unverified<boolean>(source, 'Not yet verified.'),
    humanReview: unverified<boolean>(source, 'Not yet verified.'),
    jurisdiction: unverified<string>(source, 'Not yet verified.'),
  };
}

type TierKey = Exclude<ProviderTier, 'local'>;

const CATALOGUE: Record<string, Partial<Record<TierKey, PrivacyPolicyFacts>>> = {
  gemini: {
    free: blankFacts(GEMINI_TERMS),
    paid: blankFacts(GEMINI_TERMS),
  },
  groq: {
    free: blankFacts(GROQ_PRIVACY),
    paid: blankFacts(GROQ_PRIVACY),
  },
};

/**
 * Facts for a provider on a tier, or null when nothing is on file.
 *
 * A local provider returns null and is scored from observation instead - see
 * the egress === 'none' branch in assessPrivacy.
 */
export function lookupPolicyFacts(
  providerSlug: string,
  tier: ProviderTier
): PrivacyPolicyFacts | null {
  if (tier === 'local' || tier === 'unknown') {
    return null;
  }

  return CATALOGUE[providerSlug]?.[tier] ?? null;
}

/**
 * True when every dimension for this provider/tier is still unverified.
 * The dashboard uses it to prompt for verification rather than silently
 * showing "not scored" forever.
 */
export function isFullyUnverified(facts: PrivacyPolicyFacts | null): boolean {
  if (!facts) {
    return true;
  }

  return [
    facts.retentionDays,
    facts.trainsOnInput,
    facts.humanReview,
    facts.jurisdiction,
  ].every((fact) => fact.provenance === 'unverified');
}

export const POLICY_SOURCES = {
  gemini: GEMINI_TERMS,
  groq: GROQ_PRIVACY,
} as const;
