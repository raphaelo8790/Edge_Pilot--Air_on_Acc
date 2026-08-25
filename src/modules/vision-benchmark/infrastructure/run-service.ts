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

  return executeVisionBenchmark({
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
}
