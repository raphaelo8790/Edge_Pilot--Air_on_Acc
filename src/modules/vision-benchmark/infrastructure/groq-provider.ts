/**
 * The Groq vision provider.
 *
 * Groq speaks the OpenAI chat-completions dialect: the image travels as a
 * data URL inside a `image_url` content part, alongside the prompt text.
 * Only some of Groq's models accept images (the Llama 4 family at the time
 * of writing); the catalogue marks those, and a text-only model answers
 * with an error the evaluator records as a provider failure rather than a
 * wrong label.
 *
 * DETERMINISM. temperature 0, as with every other adapter here, so a rerun
 * of the same image gets the same answer from the same weights.
 *
 * The key travels in the Authorization header, never in the URL or body.
 * Same rule as the benchmark module's GroqProvider.
 */

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

const GroqChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
        }),
      })
    )
    .min(1),
});

export interface GroqVisionProviderOptions {
  apiKey: string;
  model: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImplementation?: VisionFetch;
  clock?: MillisecondClock;
}

/**
 * Node has Buffer; a browser does not. This adapter is server-only (the key
 * must not reach a page), so Buffer is the right tool, as in the Gemini one.
 */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export class GroqVisionProvider implements VisionProvider {
  readonly providerName = 'groq';
  readonly kind = 'cloud' as const;
  readonly modelName: string;

  private readonly apiKey: string;
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: VisionFetch;
  private readonly clock: MillisecondClock;

  constructor(options: GroqVisionProviderOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new Error('GROQ_API_KEY is required.');
    }

    this.apiKey = options.apiKey;
    this.modelName = options.model;
    this.endpoint = new URL(
      options.endpoint ?? 'https://api.groq.com/openai/v1/chat/completions'
    );
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.clock = options.clock ?? systemMillisecondClock;

    if (this.endpoint.protocol !== 'https:') {
      throw new Error('The Groq endpoint must use HTTPS.');
    }
  }

  async classify(request: VisionProviderRequest): Promise<VisionProviderResponse> {
    const startedAt = this.clock();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.modelName,
          temperature: 0,
          max_tokens: 32,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${request.image.mimeType};base64,${toBase64(request.image.data)}`,
                  },
                },
              ],
            },
          ],
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

      const payload = GroqChatResponseSchema.safeParse(await response.json());

      if (!payload.success) {
        return {
          rawOutput: '',
          latencyMs: this.clock() - startedAt,
          success: false,
          errorMessage: 'Groq returned an invalid response payload.',
        };
      }

      return {
        rawOutput: payload.data.choices[0].message.content ?? '',
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
          error instanceof Error ? error.message : 'Unknown Groq provider error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
