/**
 * Groq adapter — cloud provider, OpenAI-compatible surface.
 *
 * Streaming contract (official source:
 * https://console.groq.com/docs/api-reference#chat-create):
 * POST /openai/v1/chat/completions with `stream: true` returns Server-Sent
 * Events. Usage is omitted from streamed chunks unless
 * `stream_options: { include_usage: true }` is sent; with it, the final chunk
 * carries `usage`. Groq additionally reports `x_groq.usage.completion_time`
 * in SECONDS, which is server-side generation time excluding queueing — a
 * better throughput denominator than our wall clock.
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
import { isUsableKey } from './GeminiProvider';
import { emptyUsage, type ProviderMetadata, type ProviderUsage } from './types';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

interface GroqUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  completion_time?: number;
}

interface GroqStreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: GroqUsage;
  x_groq?: { usage?: GroqUsage };
  error?: { message?: string };
}

export interface GroqProviderOptions extends ProviderAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
}

export class GroqProvider extends BaseProvider {
  public readonly name = 'groq';
  public readonly type = 'cloud' as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GroqProviderOptions = {}) {
    super(options);
    this.apiKey = options.apiKey ?? process.env.GROQ_API_KEY ?? '';
    this.baseUrl = options.baseUrl ?? GROQ_BASE_URL;
  }

  public describe(): ProviderMetadata {
    return {
      name: this.name,
      type: this.type,
      displayName: 'Groq',
      baseUrl: this.baseUrl,
      privacyLevel: 'low',
      reports: { ttft: true, outputTokens: true },
      officialSource: 'https://console.groq.com/docs/api-reference#chat-create',
    };
  }

  public isConfigured(): boolean {
    return isUsableKey(this.apiKey);
  }

  protected configurationHint(): string {
    return 'GROQ_API_KEY is not set. Add it to .env (server-side only — never NEXT_PUBLIC_).';
  }

  protected async streamOnce(
    prompt: string,
    model: string,
    signal: AbortSignal,
    startedAt: number
  ): Promise<StreamOutcome> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal,
      }
    );

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

      let chunk: GroqStreamChunk;

      try {
        chunk = JSON.parse(payload) as GroqStreamChunk;
      } catch {
        return;
      }

      if (chunk.error?.message) {
        streamError = chunk.error.message;
        return;
      }

      const content = chunk.choices?.[0]?.delta?.content;

      // The first chunk of an OpenAI-shaped stream carries only the role, so
      // TTFT is taken on the first chunk with actual content.
      if (typeof content === 'string' && content.length > 0) {
        if (ttftMs === null) {
          ttftMs = this.clock() - startedAt;
        }
        text += content;
      }

      const reported = chunk.usage ?? chunk.x_groq?.usage;

      if (reported) {
        if (typeof reported.completion_tokens === 'number') {
          usage.outputTokens = reported.completion_tokens;
        }
        if (typeof reported.prompt_tokens === 'number') {
          usage.inputTokens = reported.prompt_tokens;
        }
        if (
          typeof reported.completion_time === 'number' &&
          reported.completion_time > 0
        ) {
          usage.providerReportedDurationMs = Number(
            (reported.completion_time * 1000).toFixed(3)
          );
        }
      }
    });

    if (streamError !== null) {
      throw new ProviderFailureError(classifyHttpStatus(400, streamError));
    }

    return { text, ttftMs, usage };
  }
}
