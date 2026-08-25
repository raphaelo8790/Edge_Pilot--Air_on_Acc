/**
 * The Ollama vision provider that runs in the user's browser.
 *
 * WHY IT IS NOT THE SERVER ONE. OllamaVisionProvider builds its base64 with
 * `Buffer`, which does not exist in a browser, and it runs on whatever machine
 * the server is on. For an uploaded dataset that is the wrong machine twice
 * over: the images would have to travel to the server, and the model measured
 * would be the server's rather than the user's.
 *
 * This talks from the tab straight to the user's own Ollama, so an uploaded
 * photograph goes exactly one place - localhost - and the latency measured is
 * the user's hardware rather than a datacentre's.
 *
 * DETERMINISM IS PRESERVED. temperature 0 and seed 42, identical to the server
 * provider, so a browser run and a server run of the same images differ only
 * by the preprocessing pipeline, which the evidence records separately.
 *
 * TWO THINGS THAT BITE IN PRODUCTION, both worth knowing before deploying:
 * a page served over https may call http://localhost because loopback counts
 * as a trustworthy origin, but Ollama must also allow the page's origin via
 * OLLAMA_ORIGINS or the browser's CORS check fails before any request lands.
 */

import { z } from 'zod';
import type {
  VisionProvider,
  VisionProviderRequest,
} from '../application/provider';
import type {
  VisionProviderKind,
  VisionProviderResponse,
} from '../core/types';

const OllamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

/**
 * Chunked because String.fromCharCode on a few hundred kilobytes at once
 * blows the argument limit and throws RangeError. 8 KB per call is well
 * inside every engine's limit.
 *
 * Array.from rather than spread: "target": "es5" without downlevelIteration
 * rejects spreading a typed array outright, and silently yields an empty
 * array for a Map or Set. Array.from is a runtime call, emitted as written.
 */
function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x2000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(index, index + chunkSize))
    );
  }

  return btoa(binary);
}

export interface BrowserOllamaVisionProviderOptions {
  /** Where the user's Ollama listens, e.g. http://localhost:11434 */
  host: string;
  model: string;
  /** Per-image budget. A warm model answers in seconds; this is the ceiling. */
  timeoutMs?: number;
}

export class BrowserOllamaVisionProvider implements VisionProvider {
  readonly providerName = 'ollama-browser';
  readonly kind: VisionProviderKind = 'local';
  readonly modelName: string;

  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: BrowserOllamaVisionProviderOptions) {
    const host = options.host.replace(/\/+$/, '');
    const parsed = new URL(host);

    // `new URL('localhost:11434')` does NOT throw - it reads "localhost:" as
    // the scheme - so the protocol is checked explicitly rather than trusted.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(
        'The Ollama host must start with http:// or https://.'
      );
    }

    this.endpoint = `${host}/api/chat`;
    this.modelName = options.model;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  public async classify(
    request: VisionProviderRequest
  ): Promise<VisionProviderResponse> {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            {
              role: 'user',
              content: request.prompt,
              images: [toBase64(request.image.data)],
            },
          ],
          stream: false,
          options: { temperature: 0, seed: 42 },
        }),
      });

      if (!response.ok) {
        return {
          rawOutput: '',
          latencyMs: performance.now() - startedAt,
          success: false,
          errorMessage: `Ollama answered ${response.status}. ${await response
            .text()
            .catch(() => '')}`.trim(),
        };
      }

      const payload = OllamaChatResponseSchema.safeParse(
        await response.json()
      );

      if (!payload.success) {
        return {
          rawOutput: '',
          latencyMs: performance.now() - startedAt,
          success: false,
          errorMessage: 'Ollama returned an invalid response payload.',
        };
      }

      return {
        rawOutput: payload.data.message.content,
        latencyMs: performance.now() - startedAt,
        success: true,
        errorMessage: null,
      };
    } catch (error) {
      const aborted =
        error instanceof DOMException && error.name === 'AbortError';

      return {
        rawOutput: '',
        latencyMs: performance.now() - startedAt,
        success: false,
        errorMessage: aborted
          ? `No answer within ${this.timeoutMs / 1000}s. A model that is not loaded can spend that long just being read into memory.`
          : error instanceof Error
            ? `Could not reach Ollama at ${this.endpoint}. ${error.message}`
            : 'Unknown Ollama error.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
