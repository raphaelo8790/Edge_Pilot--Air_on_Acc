/**
 * The built-in reference dataset, run in the visitor's browser against the
 * visitor's own Ollama.
 *
 * WHY THIS EXISTS. The "Run benchmark" button used to call a server action,
 * which called the SERVER's Ollama. On a laptop that is the same machine;
 * hosted, it is a datacentre container with no Ollama in it. The only Ollama
 * a visitor can benchmark is their own, and the only thing that can reach it
 * is the page in their browser - so for the local provider, the run moves
 * here. Cloud providers keep the server action, because that is where a key
 * can be kept out of a web page.
 *
 * SAME RUN, DIFFERENT ROOM. The samples, labels, prompt, prompt version,
 * workload version and manifest digest all come from the server's own
 * description of the dataset (/api/v1/vision-benchmarks/dataset), and the
 * executor is the same function the server and the CLI call. What differs is
 * recorded on the evidence: the image processor is the browser one
 * (`browser-canvas-png-v1`), the device profile says `browser-client`, and
 * the commit is whatever the server reports for itself.
 */

import { executeVisionBenchmark } from '@/modules/vision-benchmark/application/executor';
import { BrowserVisionImageProcessor } from '@/modules/vision-benchmark/infrastructure/browser-image-processor';
import { BrowserOllamaVisionProvider } from '@/modules/vision-benchmark/infrastructure/browser-ollama-provider';
import { OllamaResidencyProbe } from '@/modules/benchmark/infrastructure/OllamaResidencyProbe';
import { assessHardwareFit } from '@/modules/benchmark/core/services/HardwareFitAssessor';
import { BROWSER_OLLAMA_HOST } from '@/modules/benchmark/infrastructure/browser-ollama';
import type {
  VisionBenchmarkEvidence,
  VisionBenchmarkSample,
} from '@/modules/vision-benchmark/core/types';

interface DatasetDescription {
  dataset_id: string;
  workload_id: string;
  manifest_version: string;
  manifest_sha256: string;
  labels: string[];
  prompt: string;
  prompt_version: string;
  workload_version: string;
  samples: Array<VisionBenchmarkSample & { image_url: string }>;
}

/** Matches GitCommitSchema; the fixtures use the same marker for "not a release". */
const NO_COMMIT_MARKER = '0000000';

const THRESHOLDS = {
  minimumAccuracy: 0.8,
  minimumMacroF1: 0.75,
  maximumInvalidOutputRate: 0.05,
  minimumSuccessfulRequestRate: 0.95,
};

async function describeDataset(): Promise<DatasetDescription> {
  const response = await fetch('/api/v1/vision-benchmarks/dataset', { cache: 'no-store' });
  const body = (await response.json()) as { success: boolean; data?: DatasetDescription; error?: string };

  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? 'The built-in dataset could not be described.');
  }

  return body.data;
}

/** Every fixture as a File, keyed by sample id, the way the upload panel keys its own. */
async function fetchImages(
  samples: DatasetDescription['samples'],
  onProgress?: (note: string) => void
): Promise<Map<string, File>> {
  const files = new Map<string, File>();

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    onProgress?.(`Fetching image ${index + 1} of ${samples.length}…`);

    const response = await fetch(sample.image_url, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Could not fetch ${sample.imagePath} (HTTP ${response.status}).`);
    }

    const blob = await response.blob();
    files.set(
      sample.id,
      new File([blob], sample.imagePath.split('/').pop() ?? sample.id, { type: 'image/png' })
    );
  }

  return files;
}

export interface BrowserBuiltInRunOptions {
  model: string;
  host?: string;
  onProgress?: (note: string) => void;
}

export async function runBuiltInDatasetInBrowser(
  options: BrowserBuiltInRunOptions
): Promise<VisionBenchmarkEvidence> {
  const host = options.host ?? BROWSER_OLLAMA_HOST;

  options.onProgress?.('Reading the dataset manifest…');
  const dataset = await describeDataset();
  const files = await fetchImages(dataset.samples, options.onProgress);

  options.onProgress?.(
    `Warming ${options.model}, then classifying ${dataset.samples.length} images…`
  );

  const samples: VisionBenchmarkSample[] = dataset.samples.map((sample) => {
    // Strip the transport-only field so the evidence carries the manifest's
    // own sample shape and nothing else.
    const { image_url: _url, ...rest } = sample;
    void _url;
    return rest;
  });

  const evidence = await executeVisionBenchmark({
    provider: new BrowserOllamaVisionProvider({ host, model: options.model }),
    imageProcessor: new BrowserVisionImageProcessor(files),
    samples,
    labels: dataset.labels,
    datasetId: dataset.dataset_id,
    workloadId: dataset.workload_id,
    prompt: dataset.prompt,
    promptVersion: dataset.prompt_version,
    workloadVersion: dataset.workload_version,
    manifestVersion: dataset.manifest_version,
    manifestSha256: dataset.manifest_sha256,
    executionMode: 'live',
    deviceProfileId: 'browser-client',
    gitCommitSha: NO_COMMIT_MARKER,
    thresholds: THRESHOLDS,
    limitations: [
      'The bundled dataset contains synthetic fixtures and does not estimate production-site accuracy.',
      'This workload measures single-label classification without localization.',
      'Images were prepared in the browser (canvas) rather than by Sharp on a server; the processor version on this evidence says which.',
      `Run from the browser against the Ollama at ${host}; the EdgePilot server made no model call.`,
    ],
  });

  // Residency straight after the run, while the model is still loaded - the
  // same moment the server's run-service reads it. From the tab, because
  // that is where the runtime is.
  try {
    const observation = await new OllamaResidencyProbe({ host }).observe(options.model);
    const fit = assessHardwareFit('local', observation);
    const resident = observation.residentBytes;
    const vram = observation.vramBytes;

    return {
      ...evidence,
      hardwareFit: {
        state: fit.state,
        residentBytes: resident,
        vramBytes: vram,
        spilledBytes:
          resident === null || vram === null ? null : Math.max(0, resident - vram),
        summary: fit.summary,
      },
    };
  } catch {
    return { ...evidence, hardwareFit: null };
  }
}
