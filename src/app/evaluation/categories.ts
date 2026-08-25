/**
 * How the evaluation matrix's categories are presented.
 *
 * Kept out of the page so a test can hold it against the artefact: the page
 * renders category by category, so a case carrying a category that is not
 * listed here would be dropped from the page silently — present in the file,
 * counted in the totals, and invisible to the reader. That is exactly the
 * failure a pass count would not catch.
 */

/** Reading order, not file order: the benign case first, the attacks after. */
export const CATEGORY_ORDER = [
  "normal",
  "malformed",
  "ambiguous",
  "injection",
  "missing-evidence",
  "provider-failure",
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  normal: "Normal",
  malformed: "Malformed input",
  ambiguous: "Ambiguous request",
  injection: "Prompt injection",
  "missing-evidence": "Missing evidence",
  "provider-failure": "Provider failure",
};

export const CATEGORY_BLURB: Record<string, string> = {
  normal: "A well-formed request survives validation untouched.",
  malformed:
    "Bad input is refused and the offending field is named, rather than coerced into something that would run.",
  ambiguous:
    "A request that cannot produce a comparable answer is refused with a reason, instead of returning a number nobody should rank.",
  injection:
    "Model output is never obeyed. It is matched against a closed set of permitted labels, and anything else is recorded as invalid.",
  "missing-evidence":
    "What could not be measured is excluded from the score rather than counted as zero.",
  "provider-failure":
    "A failure another provider could plausibly not share falls back; a configuration fault does not.",
};
