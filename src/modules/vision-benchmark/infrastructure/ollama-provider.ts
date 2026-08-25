import { z } from 'zod';
import {
  VisionProvider,
  VisionProviderRequest,
} from '../application/provider';
import { VisionProviderResponse } from '../core/types';
import {
  MillisecondClock,
  readProviderError,
  systemMillisecondClock,
  VisionFetch,
} from './http';

const OllamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

export interface OllamaVisionProviderOptions {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImplementation?: VisionFetch;
  clock?: MillisecondClock;
}

export class OllamaVisionProvider implements VisionProvider {
  readonly providerName = 'ollama';
  readonly kind = 'local' as const;
  readonly modelName: string;

  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: VisionFetch;
  private readonly clock: MillisecondClock;

  constructor(options: OllamaVisionProviderOptions) {
    this.modelName = options.model;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImplementation =
      options.fetchImplementation ?? globalThis.fetch;
    this.clock = options.clock ?? systemMillisecondClock;

    const baseUrl = options.baseUrl ?? 'http://localhost:11434';
    const normalizedBaseUrl = baseUrl.endsWith('/')
      ? baseUrl
      : `${baseUrl}/`;

    this.endpoint = new URL('api/chat', normalizedBaseUrl);

    if (
      this.endpoint.protocol !== 'http:' &&
      this.endpoint.protocol !== 'https:'
    ) {
      throw new Error('OLLAMA_HOST must use HTTP or HTTPS.');
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
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            {
              role: 'user',
              content: request.prompt,
              images: [
                Buffer.from(request.image.data).toString('base64'),
              ],
            },
          ],
          stream: false,
          options: {
            temperature: 0,
            seed: 42,
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

      const payload = OllamaChatResponseSchema.safeParse(
        await response.json()
      );

      if (!payload.success) {
        return {
          rawOutput: '',
          latencyMs: this.clock() - startedAt,
          success: false,
          errorMessage: 'Ollama returned an invalid response payload.',
        };
      }

      return {
        rawOutput: payload.data.message.content,
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
            : 'Unknown Ollama provider error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
