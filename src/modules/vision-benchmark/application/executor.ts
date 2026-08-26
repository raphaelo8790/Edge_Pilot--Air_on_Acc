import { evaluateVisionBenchmark } from './evaluator';
import {
  VisionImageProcessor,
  VisionProvider,
} from './provider';
import {
  VISION_DATASET_ID,
  PreparedVisionImage,
  VisionExecutionMode,
  VisionBenchmarkEvidence,
  VisionBenchmarkSample,
  VisionBenchmarkThresholds,
  VisionProviderResponse,
} from '../core/types';

export interface VisionBenchmarkClock {
  nowIso(): string;
  nowMilliseconds(): number;
}

export interface ExecuteVisionBenchmarkInput {
  provider: VisionProvider;
  imageProcessor: VisionImageProcessor;
  samples: VisionBenchmarkSample[];
  workloadVersion: string;
  manifestVersion: string;
  /** The dataset's own classes. Defaults to the built-in seven. */
  labels?: readonly string[];
  /**
   * Whether to make a discarded first request. Defaults to true, and applies
   * only to local providers.
   *
   * Set false when the caller knows the model is already resident, or when a
   * test drives a provider whose responses are a scripted sequence - a
   * discarded call consumes one, and the remaining answers then belong to the
   * wrong images.
   */
  warmUp?: boolean;
  /** The dataset's own id. Defaults to the built-in one. */
  datasetId?: string;
  workloadId?: string;
  manifestSha256: string;
  promptVersion: string;
  prompt: string;
  executionMode: VisionExecutionMode;
  deviceProfileId: string;
  gitCommitSha: string;
  thresholds?: Partial<VisionBenchmarkThresholds>;
  limitations?: string[];
  /**
   * How many samples may be in flight at once. Defaults to 1, which is the
   * only honest setting for a local model: two requests to one GPU measure
   * contention, not the model. A cloud provider serves requests
   * independently, so a hosted run may raise this to fit a serverless time
   * limit. Order of the recorded responses is the sample order regardless.
   */
  concurrency?: number;
  clock?: VisionBenchmarkClock;
}

const systemClock: VisionBenchmarkClock = {
  nowIso(): string {
    return new Date().toISOString();
  },

  nowMilliseconds(): number {
    return Date.now();
  },
};

function normalizeLatency(
  startMilliseconds: number,
  endMilliseconds: number
): number {
  const latency = endMilliseconds - startMilliseconds;

  if (!Number.isFinite(latency) || latency < 0) {
    return 0;
  }

  return latency;
}

async function classifySample(
  provider: VisionProvider,
  sample: VisionBenchmarkSample,
  image: PreparedVisionImage,
  prompt: string,
  clock: VisionBenchmarkClock
): Promise<VisionProviderResponse> {
  const startedAt = clock.nowMilliseconds();

  try {
    const response = await provider.classify({
      sample,
      image,
      prompt,
    });

    const measuredLatency = normalizeLatency(
      startedAt,
      clock.nowMilliseconds()
    );

    if (
      !Number.isFinite(response.latencyMs) ||
      response.latencyMs < 0
    ) {
      return {
        ...response,
        latencyMs: measuredLatency,
      };
    }

    return response;
  } catch (error) {
    return {
      rawOutput: '',
      latencyMs: normalizeLatency(
        startedAt,
        clock.nowMilliseconds()
      ),
      success: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : 'Unknown provider error',
    };
  }
}

export async function executeVisionBenchmark(
  input: ExecuteVisionBenchmarkInput
): Promise<VisionBenchmarkEvidence> {
  if (input.prompt.trim().length === 0) {
    throw new Error('The vision benchmark prompt cannot be empty.');
  }

  const clock = input.clock ?? systemClock;

  // ---- Discarded warm-up -------------------------------------------------
  //
  // The first classify() call pays for loading the model into GPU memory. On
  // this project an 8B text model measured 36,445 ms to first token cold and
  // 369 ms warm - the same model, same prompt, minutes apart. Here that cost
  // would land on sample 1 and be scored as if it were that image's latency,
  // and against a 120 s per-request timeout it can turn a cold load into a
  // FAILED request, dropping successfulRequestRate below its threshold and
  // failing the run for a disk read.
  //
  // So the first sample is classified once and thrown away before the clock
  // starts. Its result is never recorded, never scored, never counted.
  // Failures here are swallowed on purpose: if the model is genuinely broken
  // the real loop will say so with evidence, and a warm-up that could fail
  // the run would defeat its own point.
  // Local only. The cost this absorbs is reading model weights into GPU
  // memory, which is a local phenomenon: a cloud model has none, so a warm-up
  // there would be a wasted billable request and one more image handed to a
  // third party for no measurement benefit.
  const warmUpSample =
    input.warmUp !== false && input.provider.kind === 'local'
      ? input.samples[0]
      : undefined;

  if (warmUpSample) {
    try {
      const warmUpImage = await input.imageProcessor.prepare(warmUpSample);

      // provider.classify directly, NOT classifySample: the warm-up needs no
      // timing, and going through the timed path would consume clock readings
      // for a result nobody keeps. A deterministic test clock hands out a
      // fixed sequence, so a discarded call that quietly ate two of its values
      // would exhaust it - the timing helper is for measurements, and this is
      // not one.
      await input.provider.classify({
        sample: warmUpSample,
        image: warmUpImage,
        prompt: input.prompt,
      });
    } catch {
      // Deliberately ignored - see above.
    }
  }

  const startedAt = clock.nowIso();
  const concurrency = Math.max(1, Math.floor(input.concurrency ?? 1));
  const responses: VisionProviderResponse[] = new Array(input.samples.length);

  // Batches of `concurrency`, each batch awaited before the next starts, and
  // each response written to its sample's own slot - so a batch of one is
  // exactly the sequential loop this used to be, byte for byte in the output.
  for (let start = 0; start < input.samples.length; start += concurrency) {
    const batch = input.samples.slice(start, start + concurrency);

    await Promise.all(
      batch.map(async (sample, offset) => {
        const image = await input.imageProcessor.prepare(sample);
        responses[start + offset] = await classifySample(
          input.provider,
          sample,
          image,
          input.prompt,
          clock
        );
      })
    );
  }

  const completedAt = clock.nowIso();

  return evaluateVisionBenchmark({
    workloadVersion: input.workloadVersion,
    datasetId: input.datasetId ?? VISION_DATASET_ID,
    workloadId: input.workloadId,
    labels: input.labels,
    manifestVersion: input.manifestVersion,
    manifestSha256: input.manifestSha256,
    preprocessingVersion: input.imageProcessor.version,
    promptVersion: input.promptVersion,
    executionMode: input.executionMode,
    provider: input.provider.providerName,
    providerKind: input.provider.kind,
    model: input.provider.modelName,
    deviceProfileId: input.deviceProfileId,
    gitCommitSha: input.gitCommitSha,
    startedAt,
    completedAt,
    samples: input.samples,
    responses,
    thresholds: input.thresholds,
    limitations: [
      ...(input.limitations ?? []),
      `Provider execution mode: ${input.provider.kind}.`,
      'One discarded warm-up request was made before timing began, so the latencies below measure inference rather than model loading.',
    ],
  });
}
