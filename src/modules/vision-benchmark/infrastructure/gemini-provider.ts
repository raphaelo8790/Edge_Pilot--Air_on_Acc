import { z } from 'zod';
import {
  VisionProvider,
  VisionProviderRequest,
} from '../application/provider';
import { VisionLabelSchema } from '../core/schemas';
import {
  VISION_LABELS,
  VisionProviderResponse,
} from '../core/types';
import {
  MillisecondClock,
  readProviderError,
  systemMillisecondClock,
  VisionFetch,
} from './http';

const GeminiInteractionResponseSchema = z.object({
  output_text: z.string(),
});

const GeminiStructuredLabelSchema = z.object({
  label: VisionLabelSchema,
});

export interface GeminiVisionProviderOptions {
  apiKey: string;
  model: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImplementation?: VisionFetch;
  clock?: MillisecondClock;
}

function normalizeGeminiOutput(outputText: string): string {
  try {
    const parsed = GeminiStructuredLabelSchema.safeParse(
      JSON.parse(outputText)
    );

    return parsed.success ? parsed.data.label : outputText;
  } catch {
    return outputText;
  }
}

export class GeminiVisionProvider implements VisionProvider {
  readonly providerName = 'gemini';
  readonly kind = 'cloud' as const;
  readonly modelName: string;

  private readonly apiKey: string;
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: VisionFetch;
  private readonly clock: MillisecondClock;

  constructor(options: GeminiVisionProviderOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new Error('GEMINI_API_KEY is required.');
    }

    this.apiKey = options.apiKey;
    this.modelName = options.model;
    this.endpoint = new URL(
      options.endpoint ??
        'https://generativelanguage.googleapis.com/v1beta/interactions'
    );
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImplementation =
      options.fetchImplementation ?? globalThis.fetch;
    this.clock = options.clock ?? systemMillisecondClock;

    if (this.endpoint.protocol !== 'https:') {
      throw new Error('The Gemini endpoint must use HTTPS.');
    }
  }

  async classify(
    request: VisionProviderRequest
  ): Promise<VisionProviderResponse> {
    const startedAt = this.clock();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs
    );

    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.modelName,
          input: [
            {
              type: 'text',
              text: request.prompt,
            },
            {
              type: 'image',
              data: Buffer.from(request.image.data).toString('base64'),
              mime_type: request.image.mimeType,
            },
          ],
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: {
              type: 'object',
              properties: {
                label: {
                  type: 'string',
                  enum: VISION_LABELS,
                },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
          generation_config: {
            thinking_level: 'minimal',
          },
        }),
      });

      if (!response.ok) {
        return {
          rawOutput: '',
          latencyMs: this.clock() - startedAt,
          success: false,
          errorMessage: await readProviderError(response),
        };
      }

      const payload = GeminiInteractionResponseSchema.safeParse(
        await response.json()
      );

      if (!payload.success) {
        return {
          rawOutput: '',
          latencyMs: this.clock() - startedAt,
          success: false,
          errorMessage: 'Gemini returned an invalid response payload.',
        };
      }

      return {
        rawOutput: normalizeGeminiOutput(payload.data.output_text),
        latencyMs: this.clock() - startedAt,
        success: true,
        errorMessage: null,
      };
    } catch (error) {
      return {
        rawOutput: '',
        latencyMs: this.clock() - startedAt,
        success: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Unknown Gemini provider error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
