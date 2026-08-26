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

/**
 * Ollama reports its own timings on every reply, in NANOSECONDS, even when
 * `stream: false`. They were being parsed away and thrown out. They are more
 * trustworthy than our wall clock for anything happening inside the runtime,
 * because they exclude the network and our own overhead.
 *
 * All optional: a future runtime version that stops sending one must produce
 * null, not break the run.
 */
const OllamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
  total_duration: z.number().nonnegative().optional(),
  load_duration: z.number().nonnegative().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  prompt_eval_duration: z.number().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
  eval_duration: z.number().nonnegative().optional(),
});

/** Nanoseconds to milliseconds. Undefined stays null - never zero. */
function nsToMs(value: number | undefined): number | null {
  return typeof value === 'number' ? value / 1_000_000 : null;
}

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
        runtime: {
          totalMs: nsToMs(payload.data.total_duration),
          loadMs: nsToMs(payload.data.load_duration),
          promptEvalMs: nsToMs(payload.data.prompt_eval_duration),
          promptTokens: payload.data.prompt_eval_count ?? null,
          evalMs: nsToMs(payload.data.eval_duration),
          outputTokens: payload.data.eval_count ?? null,
        },
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
