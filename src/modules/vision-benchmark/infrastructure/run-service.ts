import path from 'node:path';
import { executeVisionBenchmark } from '../application/executor';
import {
  VisionBenchmarkRunRequestSchema,
} from '../core/schemas';
import { VisionBenchmarkEvidence } from '../core/types';
import { GeminiVisionProvider } from './gemini-provider';
import { SharpVisionImageProcessor } from './image-processor';
import {
  loadVisionDatasetManifest,
} from './manifest-loader';
import { OllamaVisionProvider } from './ollama-provider';
import { OllamaResidencyProbe } from '@/modules/benchmark/infrastructure/OllamaResidencyProbe';
import { assessHardwareFit } from '@/modules/benchmark/core/services/HardwareFitAssessor';
import { VisionFetch } from './http';

export interface RunVisionBenchmarkOptions {
  repositoryRoot: string;
  environment?: NodeJS.ProcessEnv;
  fetchImplementation?: VisionFetch;
}

export async function runVisionBenchmarkRequest(
  unvalidatedRequest: unknown,
  options: RunVisionBenchmarkOptions
): Promise<VisionBenchmarkEvidence> {
  const request = VisionBenchmarkRunRequestSchema.parse(
    unvalidatedRequest
  );
  const environment = options.environment ?? process.env;
  const loadedManifest = await loadVisionDatasetManifest(
    options.repositoryRoot
  );

  if (loadedManifest.manifest.status !== 'ready') {
    throw new Error(
      'The vision dataset manifest is not ready for execution.'
    );
  }

  const imageProcessor = new SharpVisionImageProcessor({
    repositoryRoot: options.repositoryRoot,
  });

  const provider =
    request.provider === 'ollama'
      ? new OllamaVisionProvider({
          model: request.model,
          baseUrl:
            environment.OLLAMA_HOST ?? 'http://localhost:11434',
          fetchImplementation: options.fetchImplementation,
        })
      : new GeminiVisionProvider({
          model: request.model,
          apiKey: environment.GEMINI_API_KEY ?? '',
          fetchImplementation: options.fetchImplementation,
        });

  const evidence = await executeVisionBenchmark({
    provider,
    imageProcessor,
    samples: loadedManifest.manifest.samples,
    workloadVersion: '1.0.0',
    manifestVersion: loadedManifest.manifest.manifestVersion,
    manifestSha256: loadedManifest.manifestSha256,
    promptVersion: request.promptVersion,
    prompt: request.prompt,
    executionMode: 'live',
    deviceProfileId: request.deviceProfileId,
    gitCommitSha: request.gitCommitSha,
    thresholds: request.thresholds,
    limitations: [
      'The bundled dataset contains synthetic fixtures and does not estimate production-site accuracy.',
      'This workload measures single-label classification without localization.',
      `Evidence directory: ${path.join(
        'evidence',
        'vision-benchmark'
      )}.`,
    ],
  });

  // Residency is read straight after the run, while the model is still loaded:
  // Ollama unloads once its keep-alive expires and /api/ps then reports
  // nothing, which would turn a real measurement into "not observed".
  //
  // Only for the local provider. A cloud model runs on someone else's
  // hardware, and reporting a fit for it would be inventing a fact.
  if (request.provider !== 'ollama') {
    return { ...evidence, hardwareFit: null };
  }

  try {
    const probe = new OllamaResidencyProbe({
      host: environment.OLLAMA_HOST ?? 'http://localhost:11434',
    });
    const observation = await probe.observe(request.model);
    // 'local' because we only reach here for the ollama provider; the cloud
    // branch returned null above rather than asking about someone else's GPU.
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
          resident === null || vram === null
            ? null
            : Math.max(0, resident - vram),
        summary: fit.summary,
      },
    };
  } catch {
    // A failed probe must not lose a completed benchmark. The run happened;
    // we simply could not see how it sat in memory.
    return { ...evidence, hardwareFit: null };
  }
}
