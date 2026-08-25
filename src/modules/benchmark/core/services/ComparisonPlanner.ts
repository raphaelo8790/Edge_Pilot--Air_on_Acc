/**
 * EdgePilot AI - comparison execution plan
 *
 * Decides whether entrants may be compared at all, and if so whether they may
 * run at the same time.
 *
 * THE TRAP THIS EXISTS TO AVOID.
 *
 * "Compare two models in parallel" sounds like the obvious design, and for two
 * cloud providers it is: the work happens in two different datacentres and
 * neither run affects the other. For two LOCAL models it silently destroys the
 * measurement. Both models want the same GPU and the same system memory. The
 * runtime may evict one to make room for the other, they queue behind each
 * other, and the latency figures that come back describe contention rather
 * than either model. Worse, the result looks perfectly plausible - two columns
 * of numbers, both wrong, with nothing on screen to say so.
 *
 * So local entrants run sequentially, always, and the plan records that it did
 * so. A comparison that took twice as long and is true beats one that was
 * instant and is not.
 *
 * Mixed local-and-cloud is safe to run together: the local model has the
 * machine to itself while the cloud request is in flight.
 */

import {
  checkModalityCompatibility,
  classifyModality,
  type Modality,
  type ModalityVerdict,
} from './ModelModality';

export interface ComparisonEntrant {
  /** Provider slug, e.g. "ollama". */
  provider: string;
  providerType: 'local' | 'cloud';
  model: string;
  /** Families the runtime reported, when known. */
  families?: string[];
}

export type ExecutionMode = 'parallel' | 'sequential';

export interface ComparisonPlan {
  runnable: boolean;
  /** Present only when runnable is false. */
  refusal: string | null;
  mode: ExecutionMode;
  /** Why that mode was chosen. Always populated, including for parallel. */
  modeReason: string;
  modality: Modality | null;
  entrants: Array<ComparisonEntrant & { verdict: ModalityVerdict }>;
  /** Things the reader must know for the result to be interpreted correctly. */
  caveats: string[];
}

export function planComparison(entrants: ComparisonEntrant[]): ComparisonPlan {
  const classified = entrants.map((entrant) => ({
    ...entrant,
    verdict: classifyModality(entrant.model, entrant.families ?? []),
  }));

  const compatibility = checkModalityCompatibility(
    classified.map((entrant) => ({
      model: entrant.model,
      verdict: entrant.verdict,
    }))
  );

  if (!compatibility.compatible) {
    return {
      runnable: false,
      refusal: compatibility.reason,
      mode: 'sequential',
      modeReason: 'Not applicable: the comparison was refused.',
      modality: null,
      entrants: classified,
      caveats: [],
    };
  }

  const caveats = [...compatibility.caveats];
  const localCount = classified.filter(
    (entrant) => entrant.providerType === 'local'
  ).length;

  let mode: ExecutionMode;
  let modeReason: string;

  if (localCount > 1) {
    mode = 'sequential';
    modeReason =
      `${localCount} of these models run on this machine. They are benchmarked one ` +
      'after another, because two local models running at once compete for the same ' +
      'GPU and memory, and the latency that comes back would describe that contention ' +
      'rather than either model.';
  } else {
    mode = 'parallel';
    modeReason =
      localCount === 1
        ? 'Run together: only one entrant uses this machine, so nothing competes for local resources.'
        : 'Run together: every entrant runs on the provider’s own infrastructure, so the runs cannot affect each other.';
  }

  // Two entrants on the same cloud vendor share a rate limit and a quota, which
  // can make the second look slower for reasons that have nothing to do with
  // the model.
  const cloudProviders = classified
    .filter((entrant) => entrant.providerType === 'cloud')
    .map((entrant) => entrant.provider);

  const duplicatedCloud = cloudProviders.filter(
    (provider, index) => cloudProviders.indexOf(provider) !== index
  );

  if (mode === 'parallel' && duplicatedCloud.length > 0) {
    caveats.push(
      `More than one entrant uses ${Array.from(new Set(duplicatedCloud)).join(', ')}. ` +
        'Concurrent requests share that account’s rate limit, so a slower result may ' +
        'reflect throttling rather than the model.'
    );
  }

  if (localCount === 1 && classified.length > 1) {
    caveats.push(
      'The local entrant is measured on this machine and the cloud entrant over the network. ' +
        'Network round-trip is included in the cloud figures and cannot be separated from inference time.'
    );
  }

  return {
    runnable: true,
    refusal: null,
    mode,
    modeReason,
    modality: compatibility.modality,
    entrants: classified,
    caveats,
  };
}
