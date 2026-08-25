import {
  checkTaskFit,
  requirementFor,
  shapeOf,
} from '../../src/modules/benchmark/core/services/TaskCompatibility';
import type { ModalityVerdict } from '../../src/modules/benchmark/core/services/ModelModality';

const textModel: ModalityVerdict = {
  modality: 'text',
  confidence: 'inferred',
  reason: 'No vision or embedding family was reported (saw llama).',
};

const visionModel: ModalityVerdict = {
  modality: 'vision',
  confidence: 'reported',
  reason: 'The runtime reports the family "clip", which is a multimodal projector.',
};

const embeddingModel: ModalityVerdict = {
  modality: 'embedding',
  confidence: 'reported',
  reason: 'The runtime reports the family "nomic-bert".',
};

describe('checkTaskFit', () => {
  it('lets a text model run a text task', () => {
    expect(checkTaskFit('text_generation', textModel).usable).toBe(true);
  });

  it('lets a vision model run a text task, because it also generates text', () => {
    // The relationship is deliberately asymmetric: vision is a superset here.
    const fit = checkTaskFit('text_generation', visionModel);

    expect(fit.usable).toBe(true);
    expect(fit.reason).toContain('also generates text');
  });

  it('refuses a text model on an image task', () => {
    const fit = checkTaskFit('image_recognition', textModel);

    expect(fit.usable).toBe(false);
    expect(fit.reason).toContain('no vision projector');
  });

  it('lets a vision model run an image task', () => {
    expect(checkTaskFit('image_recognition', visionModel).usable).toBe(true);
    expect(checkTaskFit('multimodal', visionModel).usable).toBe(true);
  });

  it('refuses an embedding model on every task', () => {
    for (const task of [
      'text_generation',
      'code_generation',
      'image_recognition',
      'multimodal',
    ] as const) {
      const fit = checkTaskFit(task, embeddingModel);

      expect(fit.usable).toBe(false);
      expect(fit.reason).toContain('do not generate an answer');
    }
  });

  it('carries the inferred classification into the reason rather than hiding it', () => {
    const fit = checkTaskFit('text_generation', textModel);

    expect(fit.reason).toContain('did not confirm');
  });
});

describe('requirementFor', () => {
  it('asks only for a text generator on a code task, and says why', () => {
    // Nothing in the runtime's family data distinguishes a code-tuned model
    // from a general one. Requiring more would be a ranking invented here.
    const requirement = requirementFor('code_generation');

    expect(requirement.modality).toBe('text');
    expect(requirement.suitabilityUnverifiable).toBe(true);
    expect(requirement.caveat).toContain('not whether a model was tuned for code');
  });

  it('does not claim an unverifiable suitability for plain text generation', () => {
    expect(requirementFor('text_generation').suitabilityUnverifiable).toBe(false);
    expect(requirementFor('text_generation').caveat).toBe('');
  });

  it('requires vision for both image tasks', () => {
    expect(requirementFor('image_recognition').modality).toBe('vision');
    expect(requirementFor('multimodal').modality).toBe('vision');
  });
});

describe('shapeOf', () => {
  it('describes an image task as sending an image', () => {
    expect(shapeOf('image_recognition').sends).toContain('An image');
    expect(shapeOf('text_generation').sends).not.toContain('image');
  });

  it('refuses to let a code run imply the code works', () => {
    // The benchmark measures that text came back and how fast. It never
    // compiles or executes anything, and the wording has to say so - this is
    // the sentence stored on the workload row.
    expect(shapeOf('code_generation').returns).toContain('not "the code works"');
  });

  it('gives every task a non-empty shape, since these are stored NOT NULL', () => {
    for (const task of [
      'text_generation',
      'code_generation',
      'image_recognition',
      'multimodal',
    ] as const) {
      expect(shapeOf(task).sends.length).toBeGreaterThan(0);
      expect(shapeOf(task).returns.length).toBeGreaterThan(0);
    }
  });
});
