import { VISION_LABELS } from './types';

export const VISION_WORKLOAD_VERSION = '1.0.0';
export const VISION_PROMPT_VERSION = '1.0.0';

/**
 * The prompt for a dataset that defines its own classes.
 *
 * VISION_BENCHMARK_PROMPT names the seven built-in construction-safety labels
 * outright, so using it for any other dataset asks the model one question and
 * scores it against another. Observed doing exactly that: a two-class weld
 * dataset scored 0% accuracy and 100% invalid output, because llava was
 * dutifully answering "hardhat" to pictures of welds.
 *
 * Kept deliberately generic about the subject - "the single primary subject" -
 * because this module cannot know what a user's images are of, and inventing a
 * domain description would put words in their dataset's mouth.
 */
export function buildVisionPrompt(labels: readonly string[]): string {
  return [
    'Classify the single primary subject in the image.',
    `Allowed labels: ${labels.join(', ')}.`,
    'Return only one allowed label with no explanation or punctuation.',
  ].join(' ');
}

export const VISION_BENCHMARK_PROMPT = [
  'Classify the single primary construction-safety component in the image.',
  `Allowed labels: ${VISION_LABELS.join(', ')}.`,
  'Return only one allowed label with no explanation or punctuation.',
].join(' ');
