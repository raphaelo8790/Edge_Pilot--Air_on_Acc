import {
  PreparedVisionImage,
  VisionBenchmarkSample,
  VisionProviderKind,
  VisionProviderResponse,
} from '../core/types';

export interface VisionProviderRequest {
  sample: VisionBenchmarkSample;
  image: PreparedVisionImage;
  prompt: string;
}

export interface VisionImageProcessor {
  readonly version: string;

  prepare(sample: VisionBenchmarkSample): Promise<PreparedVisionImage>;
}

export interface VisionProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly kind: VisionProviderKind;

  classify(
    request: VisionProviderRequest
  ): Promise<VisionProviderResponse>;
}
