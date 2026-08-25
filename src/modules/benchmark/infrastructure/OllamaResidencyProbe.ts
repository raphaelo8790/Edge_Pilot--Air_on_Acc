/**
 * EdgePilot AI - Ollama residency probe
 *
 * Reads what actually happened to memory during a local run, so hardware fit
 * is measured rather than assumed.
 *
 * Two endpoints, both already part of Ollama's documented API:
 *
 *   GET /api/tags  - every installed model with its size on disk.
 *   GET /api/ps    - models currently resident, with `size` (total resident,
 *                    including the KV cache for the context window) and
 *                    `size_vram` (how many of those bytes are on the GPU).
 *
 * `size_vram / size` is the fit signal. It is reported by the runtime after
 * the fact, so it accounts for quantisation, context length and whatever else
 * already held VRAM - none of which a formula over "model size versus RAM"
 * would capture.
 *
 * Total system memory comes from the host. That is only the right machine
 * when the runtime is local to this process; when OLLAMA_HOST points
 * elsewhere the caller must supply the declared figure instead, and the
 * assessment labels it declared rather than measured.
 *
 * Probing must never fail a run. Every error returns nulls, hardware fit
 * becomes NOT_OBSERVED, and readiness renormalises without it.
 */

import type { HardwareObservation } from '../core/services/HardwareFitAssessor';

const PROBE_TIMEOUT_MS = 3000;

interface OllamaModelEntry {
  name?: string;
  model?: string;
  size?: number;
  size_vram?: number;
}

function matches(entry: OllamaModelEntry, model: string): boolean {
  return entry.name === model || entry.model === model;
}

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function entriesOf(payload: unknown): OllamaModelEntry[] {
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { models?: unknown }).models)
  ) {
    return (payload as { models: OllamaModelEntry[] }).models;
  }

  return [];
}

export interface ResidencyProbeOptions {
  /** Where Ollama listens. */
  host: string;
}

export class OllamaResidencyProbe {
  private readonly host: string;

  constructor(options: ResidencyProbeOptions) {
    this.host = options.host.replace(/\/+$/, '');
  }

  /**
   * Observes residency for one model. Call it immediately after a run, while
   * the model is still loaded - Ollama unloads after its keep-alive window and
   * /api/ps then reports nothing.
   */
  public async observe(model: string): Promise<HardwareObservation> {
    const [tags, ps] = await Promise.all([
      getJson(`${this.host}/api/tags`),
      getJson(`${this.host}/api/ps`),
    ]);

    const onDisk = entriesOf(tags).find((entry) => matches(entry, model));
    const resident = entriesOf(ps).find((entry) => matches(entry, model));

    return {
      modelBytesOnDisk: onDisk?.size ?? null,
      residentBytes: resident?.size ?? null,
      vramBytes: resident?.size_vram ?? null,
    };
  }
}
