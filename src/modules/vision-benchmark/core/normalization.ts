import { VISION_LABELS, VisionLabel } from './types';

const LABEL_ALIASES: Readonly<Record<string, VisionLabel>> = {
  hardhat: 'hardhat',
  hard_hat: 'hardhat',
  safety_vest: 'safety_vest',
  gloves: 'gloves',
  goggles: 'goggles',
  mask: 'mask',
  ladder: 'ladder',
  safety_cone: 'safety_cone',
};

function removeMatchingQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }

  const firstCharacter = value[0];
  const lastCharacter = value[value.length - 1];

  const hasMatchingQuotes =
    (firstCharacter === '"' && lastCharacter === '"') ||
    (firstCharacter === "'" && lastCharacter === "'") ||
    (firstCharacter === '`' && lastCharacter === '`');

  return hasMatchingQuotes ? value.slice(1, -1).trim() : value;
}

/**
 * Turns whatever the model said into one of the dataset's labels, or null.
 *
 * Null means "not a valid answer" and is counted as an invalid output, which
 * is a real quality signal: a model that replies "This image shows a hard hat"
 * when asked for a bare label has failed the instruction even though a human
 * would call it correct. That distinction is the point of the metric.
 *
 * `labels` defaults to the built-in seven, and the alias table only applies to
 * those - a user-defined dataset gets exact matching after case folding and
 * separator normalisation, because inventing synonyms for labels we have never
 * seen would be guessing at what the user meant.
 */
export function normalizeVisionLabel(
  rawOutput: string,
  labels: readonly string[] = VISION_LABELS
): string | null {
  const withoutQuotes = removeMatchingQuotes(rawOutput.trim());

  const normalized = withoutQuotes
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliased = LABEL_ALIASES[normalized];

  if (aliased && labels.includes(aliased)) {
    return aliased;
  }

  return labels.includes(normalized) ? normalized : null;
}