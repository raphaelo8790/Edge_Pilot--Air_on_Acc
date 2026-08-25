/**
 * Ollama adapter — the local provider.
 *
 * Streaming contract (official source:
 * https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion):
 * POST /api/generate with `"stream": true` returns newline-delimited JSON, one
 * object per token, and a final object with `"done": true` carrying the timing
 * and token counters. Durations are in NANOSECONDS.
 *
 * We stream even though we do not display the tokens, because time-to-first-
 * token cannot be measured from a buffered response — with `stream: false`
 * the first byte and the last byte arrive together.
 */

import {
  BaseProvider,
  ProviderFailureError,
  type ProviderAdapterOptions,
  type StreamOutcome,
} from './BaseProvider';
import { classifyHttpStatus } from './errors';
import { readLineDelimitedStream, readProviderError } from './http';
import { emptyUsage, type ProviderMetadata, type ProviderUsage } from './types';

const NANOSECONDS_PER_MILLISECOND = 1e6;

export const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';

interface OllamaStreamChunk {
  response?: string;
  done?: boolean;
  error?: string;
  eval_count?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
}

export interface OllamaProviderOptions extends ProviderAdapterOptions {
  host?: string;
}

function nanosecondsToMilliseconds(value: number | undefined): number | null {
  if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
    return null;
  }
  return Number((value / NANOSECONDS_PER_MILLISECOND).toFixed(3));
}

export class OllamaProvider extends BaseProvider {
  public readonly name = 'ollama';
  public readonly type = 'local' as const;

  private readonly host: string;

  constructor(options: OllamaProviderOptions = {}) {
    super(options);
    this.host = stripTrailingSlash(
      options.host ?? process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST
    );
  }

  public describe(): ProviderMetadata {
    return {
      name: this.name,
      type: this.type,
      displayName: 'Ollama (local)',
      baseUrl: this.host,
      // Nothing leaves the machine, so this is a fact about the deployment
      // rather than an assumption about the vendor.
      privacyLevel: 'high',
      reports: { ttft: true, outputTokens: true },
      officialSource:
        'https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion',
    };
  }

  /**
   * A host string is all the configuration Ollama needs — there is no
   * credential. Whether anything is *listening* on that host is a runtime
   * question, and produces `local_unavailable` rather than `not_configured`.
   */
  public isConfigured(): boolean {
    return this.host.length > 0;
  }

  protected configurationHint(): string {
    return 'OLLAMA_HOST is not set. Set it in .env (default http://localhost:11434).';
  }

  protected async streamOnce(
    prompt: string,
    model: string,
    signal: AbortSignal,
    startedAt: number
  ): Promise<StreamOutcome> {
    const response = await this.fetchImplementation(
      `${this.host}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: true }),
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
      let chunk: OllamaStreamChunk;

      try {
        chunk = JSON.parse(line) as OllamaStreamChunk;
      } catch {
        // A malformed line is not fatal on its own; the final `done` object
        // is what we actually need. Ignore it and keep reading.
        return;
      }

      // Ollama reports a mid-stream failure (an unloadable model, for
      // instance) as an `error` field rather than a non-200 status.
      if (typeof chunk.error === 'string' && chunk.error.length > 0) {
        streamError = chunk.error;
        return;
      }

      if (typeof chunk.response === 'string' && chunk.response.length > 0) {
        if (ttftMs === null) {
          ttftMs = this.clock() - startedAt;
        }
        text += chunk.response;
      }

      if (chunk.done === true) {
        if (typeof chunk.eval_count === 'number') {
          usage.outputTokens = chunk.eval_count;
        }
        if (typeof chunk.prompt_eval_count === 'number') {
          usage.inputTokens = chunk.prompt_eval_count;
        }
        usage.providerReportedDurationMs = nanosecondsToMilliseconds(
          chunk.eval_duration
        );
      }
    });

    if (streamError !== null) {
      throw new ProviderFailureError(classifyHttpStatus(400, streamError));
    }

    return { text, ttftMs, usage };
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
