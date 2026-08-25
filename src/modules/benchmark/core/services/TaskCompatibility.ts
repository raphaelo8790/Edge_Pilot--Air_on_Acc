/**
 * Which models can do which kind of work.
 *
 * A workload declares a task type. Until now that value was written to the
 * database and read by nothing - you could register an image_recognition
 * workload and benchmark an embedding model against it, and no part of the
 * system objected. This turns the declaration into a constraint.
 *
 * WHAT IT CAN AND CANNOT DECIDE.
 *
 * It can rule a model OUT. An embedding model returns vectors, so it cannot
 * answer a prompt of any kind. A model with no vision projector cannot accept
 * an image. Both of those are refusals the runtime's own data supports.
 *
 * It cannot rule a model IN as *good*. Ollama reports model families, not
 * competence. A code-tuned model and a general one look identical in that
 * data, so `code_generation` can only require "generates text" - the same
 * requirement as plain text generation. Anything stronger would be a ranking
 * invented from nothing. The UI must say "can do this", never "best for this".
 */

import type { Modality, ModalityVerdict } from './ModelModality';

export type TaskType =
  | 'text_generation'
  | 'code_generation'
  | 'image_recognition'
  | 'multimodal';

export interface TaskRequirement {
  /** The weakest modality that can attempt this task. */
  modality: Modality;
  /** What the task needs, for a person reading the interface. */
  needs: string;
  /**
   * True when the requirement is looser than the task name suggests, because
   * nothing in the runtime's data can verify the stronger claim.
   */
  suitabilityUnverifiable: boolean;
  /** Why, when suitabilityUnverifiable is true. Empty otherwise. */
  caveat: string;
}

const REQUIREMENTS: Record<TaskType, TaskRequirement> = {
  text_generation: {
    modality: 'text',
    needs: 'a model that generates text',
    suitabilityUnverifiable: false,
    caveat: '',
  },
  code_generation: {
    modality: 'text',
    needs: 'a model that generates text',
    suitabilityUnverifiable: true,
    caveat:
      'Any text generator can attempt code. The runtime reports model families, not whether a model was tuned for code, so a code-tuned model cannot be told apart from a general one here.',
  },
  image_recognition: {
    modality: 'vision',
    needs: 'a model that accepts images',
    suitabilityUnverifiable: false,
    caveat: '',
  },
  multimodal: {
    modality: 'vision',
    needs: 'a model that accepts images as well as text',
    suitabilityUnverifiable: false,
    caveat: '',
  },
};

/**
 * What a run of this task actually sends and gets back.
 *
 * These replaced two free-text fields the user filled in by hand - defaulted
 * to "plain text prompt" and "plain text answer", validated only as non-empty,
 * and read by nothing. A person could type "banana" and the row would save.
 *
 * Derived from the task type instead, so the description cannot disagree with
 * what the run does, and so the value stored on the workload row still
 * describes the run truthfully when it is read back a year later.
 *
 * The code-generation wording is the one that matters. This system measures
 * that text came back and how fast; it never compiles or executes anything, so
 * claiming a model "can generate code" on the strength of a benchmark here
 * would be a claim the measurement does not support.
 */
export interface TaskShape {
  /** What leaves the client for one iteration. */
  sends: string;
  /** What the provider returns, and what that does not prove. */
  returns: string;
}

const SHAPES: Record<TaskType, TaskShape> = {
  text_generation: {
    sends: 'A text prompt.',
    returns: 'Generated text.',
  },
  code_generation: {
    sends: 'A text prompt describing what the code should do.',
    returns:
      'Generated text expected to contain code. Nothing here compiles or runs it, so "it produced code" is not "the code works".',
  },
  image_recognition: {
    sends: 'An image, with a text prompt about it.',
    returns: 'Generated text describing the image.',
  },
  multimodal: {
    sends: 'A text prompt, optionally with an image.',
    returns: 'Generated text.',
  },
};

export function shapeOf(task: TaskType): TaskShape {
  return SHAPES[task];
}

export function requirementFor(task: TaskType): TaskRequirement {
  return REQUIREMENTS[task];
}

export interface TaskFit {
  /** False means the model cannot attempt the task at all. */
  usable: boolean;
  /** Plain-language reason, written for the person choosing the model. */
  reason: string;
}

/**
 * Whether a model can attempt a task.
 *
 * The ordering is deliberately asymmetric. A vision model also generates
 * text, so it can attempt a text task; a text model has no image input, so it
 * cannot attempt a vision one. Embeddings can attempt neither - they do not
 * produce language at all.
 */
export function checkTaskFit(task: TaskType, verdict: ModalityVerdict): TaskFit {
  const requirement = REQUIREMENTS[task];

  if (verdict.modality === 'embedding') {
    return {
      usable: false,
      reason:
        'Embedding models turn text into vectors for search and similarity. They do not generate an answer, so they cannot run this task.',
    };
  }

  if (requirement.modality === 'vision' && verdict.modality !== 'vision') {
    return {
      usable: false,
      reason:
        'This task sends an image. The runtime reported no vision projector for this model, so it has no way to accept one.',
    };
  }

  // Requirement is 'text' and the model is text or vision: both generate.
  if (verdict.modality === 'vision' && requirement.modality === 'text') {
    return {
      usable: true,
      reason:
        'This is a vision model, which also generates text, so it can run a text task.',
    };
  }

  return {
    usable: true,
    reason:
      verdict.confidence === 'inferred'
        ? `Treated as a text generator, though the runtime did not confirm it: ${verdict.reason}`
        : verdict.reason,
  };
}
