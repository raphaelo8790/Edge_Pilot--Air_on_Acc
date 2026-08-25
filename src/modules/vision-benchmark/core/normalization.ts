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

export function normalizeVisionLabel(
  rawOutput: string
): VisionLabel | null {
  const withoutQuotes = removeMatchingQuotes(rawOutput.trim());

  const normalized = withoutQuotes
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const label = LABEL_ALIASES[normalized];

  if (!label || !VISION_LABELS.includes(label)) {
    return null;
  }

  return label;
}