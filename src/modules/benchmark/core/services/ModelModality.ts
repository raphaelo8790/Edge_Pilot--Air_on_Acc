/**
 * EdgePilot AI - model modality
 *
 * A comparison is only meaningful between models that do the same kind of
 * work. Putting a text generator next to an embedding model produces two
 * columns of numbers with no relationship: one is measured in tokens per
 * second of generated prose, the other returns a vector and generates
 * nothing. Ranking them would be a category error dressed up as a benchmark.
 *
 * HOW A MODALITY IS DECIDED.
 *
 * Ollama reports a `families` array per model. Two of the three modalities can
 * be identified positively from it:
 *
 *   embedding - BERT-derived families. Verified against a live runtime:
 *               bge-m3 reports ["bert"], nomic-embed-text reports
 *               ["nomic-bert"].
 *   vision    - a multimodal projector family alongside the language family.
 *
 * Text is the residual: anything generative that is not vision. That is an
 * inference, not a report, so it is labelled `inferred` and a comparison that
 * depends on it carries a caveat. Generative families seen on a live runtime
 * include llama, cohere2 and qwen2 - the point of the residual rule is that
 * this list does not need to be exhaustive to stay correct.
 *
 * The marker lists below need maintenance as new architectures appear. That
 * is why an unrecognised family lands on the labelled-inference path rather
 * than being silently treated as certain.
 */

export type Modality = 'text' | 'vision' | 'embedding';

export type ModalityConfidence = 'reported' | 'inferred';

export interface ModalityVerdict {
  modality: Modality;
  confidence: ModalityConfidence;
  /** Why this verdict was reached, for the UI and the evidence trail. */
  reason: string;
}

/** Families that identify an embedding model rather than a generator. */
const EMBEDDING_FAMILIES = ['bert', 'nomic-bert', 'gte', 'jina-bert'];

/** Multimodal projector families that appear alongside a language family. */
const VISION_FAMILIES = ['clip', 'mllama', 'llava', 'qwen2vl', 'vision'];

/** Name fragments that identify an embedding model when families are absent. */
const EMBEDDING_NAME_HINTS = ['embed', 'embedding'];

function normalise(values: string[]): string[] {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

/**
 * @param modelName  the tag, e.g. "nomic-embed-text:latest"
 * @param families   families the runtime reported, empty when unavailable
 */
export function classifyModality(
  modelName: string,
  families: string[] = []
): ModalityVerdict {
  const lowerName = modelName.toLowerCase();
  const lowerFamilies = normalise(families);

  const visionMarker = lowerFamilies.find((family) =>
    VISION_FAMILIES.some((marker) => family.includes(marker))
  );

  if (visionMarker) {
    return {
      modality: 'vision',
      confidence: 'reported',
      reason: `The runtime reports the family "${visionMarker}", which is a multimodal projector.`,
    };
  }

  const embeddingMarker = lowerFamilies.find((family) =>
    EMBEDDING_FAMILIES.some((marker) => family === marker || family.endsWith(marker))
  );

  if (embeddingMarker) {
    return {
      modality: 'embedding',
      confidence: 'reported',
      reason: `The runtime reports the family "${embeddingMarker}", which produces embeddings rather than generated text.`,
    };
  }

  if (EMBEDDING_NAME_HINTS.some((hint) => lowerName.includes(hint))) {
    return {
      modality: 'embedding',
      confidence: 'inferred',
      reason: `The model name contains "embed", so it is treated as an embedding model. The runtime did not report a family that confirms this.`,
    };
  }

  return {
    modality: 'text',
    confidence: lowerFamilies.length > 0 ? 'inferred' : 'inferred',
    reason:
      lowerFamilies.length > 0
        ? `No vision or embedding family was reported (saw ${lowerFamilies.join(', ')}), so this is treated as a text generator.`
        : 'The runtime reported no families, so this is treated as a text generator.',
  };
}

export interface ModalityCompatibility {
  compatible: boolean;
  modality: Modality | null;
  /** Present when incompatible: what to tell the user. */
  reason: string | null;
  /** Present when compatible but based on inference rather than a report. */
  caveats: string[];
}

/**
 * Decides whether a set of models may be compared at all.
 *
 * Refuses rather than warns. A benchmark that ranks a text model against an
 * embedding model is not a weaker result, it is a meaningless one, and the
 * honest response is not to produce it.
 */
export function checkModalityCompatibility(
  verdicts: Array<{ model: string; verdict: ModalityVerdict }>
): ModalityCompatibility {
  if (verdicts.length < 2) {
    return {
      compatible: false,
      modality: null,
      reason: 'A comparison needs at least two models.',
      caveats: [],
    };
  }

  const distinct = Array.from(new Set(verdicts.map((v) => v.verdict.modality)));

  if (distinct.length > 1) {
    const described = verdicts
      .map((v) => `${v.model} (${v.verdict.modality})`)
      .join(' and ');

    return {
      compatible: false,
      modality: null,
      reason:
        `These models do not do the same kind of work: ${described}. ` +
        'Comparing them would produce numbers that cannot be ranked against each other.',
      caveats: [],
    };
  }

  const caveats = verdicts
    .filter((v) => v.verdict.confidence === 'inferred')
    .map(
      (v) =>
        `${v.model} was classified as ${v.verdict.modality} by inference, not by a report from the runtime. ${v.verdict.reason}`
    );

  return {
    compatible: true,
    modality: distinct[0],
    reason: null,
    caveats,
  };
}
