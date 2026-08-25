import { VISION_LABELS } from './types';

export const VISION_WORKLOAD_VERSION = '1.0.0';
export const VISION_PROMPT_VERSION = '1.0.0';

export const VISION_BENCHMARK_PROMPT = [
  'Classify the single primary construction-safety component in the image.',
  `Allowed labels: ${VISION_LABELS.join(', ')}.`,
  'Return only one allowed label with no explanation or punctuation.',
].join(' ');
