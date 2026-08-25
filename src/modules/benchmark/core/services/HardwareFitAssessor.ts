/**
 * EdgePilot AI - hardware fit
 *
 * Replaces `hardwareFit: 50`, which was a constant every device on earth
 * received, from a Raspberry Pi to a threadripper.
 *
 * WHAT THIS SCORES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * It scores PLACEMENT: did the model fit in GPU memory, and if not, how much
 * of it did. It does NOT score speed. Latency is already measured
 * directly and is already a component of readiness; if hardware fit also
 * punished CPU execution, a slow run would be penalised twice and the total
 * would stop meaning anything. A model running on CPU is not broken - it is
 * slower, and the latency term is where that shows up.
 *
 * WHERE THE NUMBERS COME FROM.
 *
 * Ollama reports, after a run, how many bytes of the model are resident and
 * how many of those are on the GPU (`/api/ps` -> `size`, `size_vram`). That
 * ratio is a measurement of fit, not an estimate: it accounts for the KV
 * cache, for whatever else already held VRAM, and for the quantisation
 * actually in use.
 *
 * WHAT WAS REMOVED, AND WHY.
 *
 * This used to also compute memory headroom from total system RAM, and dock
 * 20 points when free memory fell under 15%. That RAM figure came from
 * os.totalmem() - which is the SERVER's memory, not the machine running the
 * model, and this application is meant to be hosted while the runtime stays
 * on the user's own hardware. The fallback was a figure the user typed into
 * a form. So the input was either measuring the wrong computer while being
 * labelled `measured`, or it was an unverifiable self-report, and either way
 * it moved a hundred-point score by twenty.
 *
 * It was also redundant. `size_vram / size` already says where the model
 * ended up; headroom only added a prediction about some other workload that
 * was never run. Scoring a measured run against a hypothetical one is the
 * same double-count this file's first paragraph refuses.
 *
 * CLOUD.
 *
 * Hardware fit is not applicable to a model running in someone else's
 * datacentre; the user's RAM is irrelevant to it. That returns null, not a
 * placeholder, and readiness renormalises over the components it does have.
 */

export type HardwareFitState =
  | 'FITS_GPU'
  | 'PARTIAL_OFFLOAD'
  | 'CPU_ONLY'
  | 'NOT_APPLICABLE'
  | 'NOT_OBSERVED';

export interface HardwareObservation {
  /** Bytes the model occupies on disk, from /api/tags. */
  modelBytesOnDisk: number | null;
  /** Bytes resident while loaded, from /api/ps. Includes the KV cache. */
  residentBytes: number | null;
  /** How many resident bytes are on the GPU, from /api/ps `size_vram`. */
  vramBytes: number | null;
}

export interface HardwareFitAssessment {
  /** 0-100, or null when hardware fit cannot apply or was not observed. */
  score: number | null;
  state: HardwareFitState;
  /** Share of the resident model that sat on the GPU. Measured. */
  vramFraction: number | null;
  /** Bytes of the model that sat in GPU memory, from /api/ps `size_vram`. */
  vramBytes: number | null;
  /**
   * Bytes that did NOT fit on the GPU and ran from system memory instead.
   * Null when the runtime reported no GPU figure at all - unknown, not zero.
   */
  spilledBytes: number | null;
  /** Bytes resident while loaded. Carried through for efficiency metrics. */
  residentBytes: number | null;
  limitations: string[];
  summary: string;
}

/**
 * Scoring bands. Any banding is a judgement call; the point is that they live
 * in one place, they are monotonic, and they are explained.
 *
 * A model fully resident on the GPU is the best case. Partial offload is
 * scaled by how much actually fit. CPU-only is capped rather than zeroed: it
 * works, and the latency component already reflects that it is slower.
 */
const BANDS = {
  /** Full GPU residency. */
  fitsGpu: 100,
  /** Floor and range for a partially offloaded model. */
  partialFloor: 40,
  partialRange: 55,
  /** Ceiling for a model that runs entirely on CPU. */
  cpuOnly: 50,
} as const;

function round(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * @param providerType  'cloud' short-circuits to not-applicable
 * @param observation   what the runtime reported, or null if nothing did
 */
export function assessHardwareFit(
  providerType: 'local' | 'cloud',
  observation: HardwareObservation | null
): HardwareFitAssessment {
  if (providerType === 'cloud') {
    return {
      score: null,
      state: 'NOT_APPLICABLE',
      vramFraction: null,
      vramBytes: null,
      spilledBytes: null,
      residentBytes: null,
      limitations: [
        'Hardware fit does not apply: this model runs on the provider’s hardware, so nothing about your machine affects it.',
      ],
      summary: 'Not applicable - runs on the provider’s hardware.',
    };
  }

  if (
    !observation ||
    observation.residentBytes === null ||
    observation.residentBytes <= 0
  ) {
    return {
      score: null,
      state: 'NOT_OBSERVED',
      vramFraction: null,
      vramBytes: null,
      spilledBytes: null,
      residentBytes: null,
      limitations: [
        'Hardware fit was not observed: the runtime did not report how much memory the model occupied.',
      ],
      summary: 'Not observed - the runtime reported no residency figures.',
    };
  }

  const limitations: string[] = [];
  const resident = observation.residentBytes;

  const vramFraction =
    observation.vramBytes === null ? null : observation.vramBytes / resident;

  if (vramFraction === null) {
    limitations.push(
      'GPU residency was not reported, so this is scored as CPU execution.'
    );
  }

  const vramBytes = observation.vramBytes;
  const spilledBytes = vramBytes === null ? null : Math.max(0, resident - vramBytes);

  let state: HardwareFitState;
  let base: number;
  let summary: string;

  if (vramFraction !== null && vramFraction >= 0.999) {
    state = 'FITS_GPU';
    base = BANDS.fitsGpu;
    summary =
      `The whole model sat in GPU memory, taking ${formatBytes(vramBytes ?? resident)} of VRAM. ` +
      'Nothing spilled into system memory.';
  } else if (vramFraction !== null && vramFraction > 0) {
    state = 'PARTIAL_OFFLOAD';
    base = BANDS.partialFloor + BANDS.partialRange * vramFraction;
    const spillPercent = (100 * (spilledBytes ?? 0)) / resident;
    summary =
      `${formatBytes(vramBytes ?? 0)} of the model sat in GPU memory. ` +
      `${formatBytes(spilledBytes ?? 0)} did not fit and ran from system memory ` +
      `- ${spillPercent.toFixed(0)}% of the model spilled.`;
    limitations.push(
      `Only ${(vramFraction * 100).toFixed(0)}% of the model fitted in GPU memory; the remainder ran on the CPU.`
    );
  } else {
    state = 'CPU_ONLY';
    base = BANDS.cpuOnly;
    summary =
      vramBytes === null
        ? `The model used ${formatBytes(resident)} of memory. The runtime reported no GPU figure, so this is treated as CPU execution.`
        : `The model ran entirely on the CPU, using no VRAM. All ${formatBytes(resident)} of it sat in system memory.`;
    limitations.push(
      'The model ran entirely on the CPU. That is slower, which the latency measurement already reflects; it is not counted twice here.'
    );
  }

  // The one thing these figures cannot say. Ollama reports how much VRAM the
  // model took; it does not report how much the card has. So "2.55 GB of VRAM"
  // is a measurement, and "32% of your GPU" would be an invention.
  if (vramBytes !== null && vramBytes > 0) {
    limitations.push(
      'The runtime reports how much VRAM the model used, but not how much the GPU has, so this cannot be given as a share of the card.'
    );
  }

  const score = base;

  return {
    score: round(score),
    state,
    vramFraction,
    vramBytes,
    spilledBytes,
    residentBytes: resident,
    limitations,
    summary,
  };
}

/**
 * Bytes as a person would say them. Decimal GB, because that is the unit
 * model sizes are quoted in and the unit Ollama's own figures line up with.
 */
function formatBytes(bytes: number): string {
  const GB = 1_000_000_000;
  const MB = 1_000_000;

  return bytes >= GB
    ? `${(bytes / GB).toFixed(2)} GB`
    : `${Math.round(bytes / MB)} MB`;
}
