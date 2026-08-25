/**
 * Google Gemini adapter — cloud provider.
 *
 * Streaming contract (official source:
 * https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent):
 * POST :streamGenerateContent with `alt=sse` returns Server-Sent Events. Each
 * event is a GenerateContentResponse; `usageMetadata` carries the token
 * counts and is repeated on chunks, so the last one seen wins.
 *
 * The key travels in the `x-goog-api-key` header, never in the query string —
 * a URL lands in server logs and proxy logs, a header does not.
 */

import {
  BaseProvider,
  ProviderFailureError,
  type ProviderAdapterOptions,
  type StreamOutcome,
} from './BaseProvider';
import { classifyHttpStatus } from './errors';
import {
  parseServerSentEventData,
  readLineDelimitedStream,
  readProviderError,
} from './http';
import { emptyUsage, type ProviderMetadata, type ProviderUsage } from './types';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

export interface GeminiProviderOptions extends ProviderAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
}

export class GeminiProvider extends BaseProvider {
  public readonly name = 'gemini';
  public readonly type = 'cloud' as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GeminiProviderOptions = {}) {
    super(options);
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.baseUrl = options.baseUrl ?? GEMINI_BASE_URL;
  }

  public describe(): ProviderMetadata {
    return {
      name: this.name,
      type: this.type,
      displayName: 'Google Gemini',
      baseUrl: this.baseUrl,
      // The prompt leaves the machine. "low" is the conservative reading and
      // is what the readiness calculation should see for any cloud provider;
      // a per-tier data-handling review would be needed to justify better.
      privacyLevel: 'low',
      reports: { ttft: true, outputTokens: true },
      officialSource:
        'https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent',
    };
  }

  public isConfigured(): boolean {
    return isUsableKey(this.apiKey);
  }

  protected configurationHint(): string {
    return 'GEMINI_API_KEY is not set. Add it to .env (server-side only — never NEXT_PUBLIC_).';
  }

  protected async streamOnce(
    prompt: string,
    model: string,
    signal: AbortSignal,
    startedAt: number
  ): Promise<StreamOutcome> {
    const url = `${this.baseUrl}/models/${encodeURIComponent(
      model
    )}:streamGenerateContent?alt=sse`;

    const response = await this.fetchImplementation(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
      signal,
    });

    if (!response.ok) {
      const body = await readProviderError(response);
      throw new ProviderFailureError(
        classifyHttpStatus(response.status, body)
      );
    }

    let text = '';
    let ttftMs: number | null = null;
    const usage: ProviderUsage = emptyUsage();
    let streamError: string | null = null;

    await readLineDelimitedStream(response.body, (line) => {
      const payload = parseServerSentEventData(line);

      if (payload === null) {
        return;
      }

      let chunk: GeminiStreamChunk;

      try {
        chunk = JSON.parse(payload) as GeminiStreamChunk;
      } catch {
        return;
      }

      if (chunk.error?.message) {
        streamError = chunk.error.message;
        return;
      }

      const parts = chunk.candidates?.[0]?.content?.parts ?? [];

      for (let index = 0; index < parts.length; index += 1) {
        const partText = parts[index]?.text;

        if (typeof partText === 'string' && partText.length > 0) {
          if (ttftMs === null) {
            ttftMs = this.clock() - startedAt;
          }
          text += partText;
        }
      }

      if (chunk.usageMetadata) {
        if (typeof chunk.usageMetadata.candidatesTokenCount === 'number') {
          usage.outputTokens = chunk.usageMetadata.candidatesTokenCount;
        }
        if (typeof chunk.usageMetadata.promptTokenCount === 'number') {
          usage.inputTokens = chunk.usageMetadata.promptTokenCount;
        }
      }
    });

    if (streamError !== null) {
      throw new ProviderFailureError(classifyHttpStatus(400, streamError));
    }

    return { text, ttftMs, usage };
  }
}

/**
 * The placeholder in `.env.example` is a string, so a truthiness check is not
 * enough — an unedited `.env` would present as configured and then fail
 * authentication, which reads as a provider fault instead of a setup step.
 */
export function isUsableKey(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return false;
  }

  return !/^your-.*-api-key$/i.test(trimmed) && trimmed !== 'changeme';
}
