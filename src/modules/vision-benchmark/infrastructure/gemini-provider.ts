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

/**
 * WHY THIS FILE WAS REWRITTEN.
 *
 * It used to POST to `/v1beta/interactions` with an OpenAI-Responses-shaped
 * body (`input: [...]`, `response_format`) and read a top-level `output_text`.
 * No such endpoint and no such field exist on the Gemini API: every request
 * came back 404, so every hosted Gemini vision run failed the instant it
 * started. The unit test did not catch it because it asserted the same wrong
 * shape against a mocked fetch — it proved the code agreed with itself, not
 * with Google.
 *
 * The documented call is
 *   POST /v1beta/models/{model}:generateContent
 * with the image as an `inline_data` part and the answer at
 * candidates[].content.parts[].text. That is what this now sends, and it is
 * the same shape the TEXT provider in modules/benchmark already used
 * correctly, which is why Gemini worked on the dashboard but not here.
 *
 * NOTE ON THE SCHEMA. Gemini's structured-output schema is a subset of JSON
 * Schema: type names are the upper-case proto enums, and
 * `additionalProperties` is REJECTED rather than ignored. The old body sent
 * it. Do not add it back.
 */

/** Only the parts of the response this provider reads. */
const GeminiGenerateContentResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional() }))
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      })
    )
    .optional(),
  promptFeedback: z
    .object({ blockReason: z.string().optional() })
    .optional(),
});

const GeminiStructuredLabelSchema = z.object({
  label: VisionLabelSchema,
});

export interface GeminiVisionProviderOptions {
  apiKey: string;
  model: string;
  /** API base, WITHOUT the model or method. Defaults to the public v1beta. */
  endpoint?: string;
  timeoutMs?: number;
  fetchImplementation?: VisionFetch;
  clock?: MillisecondClock;
}

const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

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

    // The model is part of the PATH on this API, not the body. Callers may
    // pass either `gemini-2.5-flash` or `models/gemini-2.5-flash`; both are
    // normalised here so the id never ends up doubled in the URL.
    const base = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, '');
    const model = options.model.trim().replace(/^models\//, '');

    this.endpoint = new URL(`${base}/models/${model}:generateContent`);
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
          contents: [
            {
              role: 'user',
              parts: [
                { text: request.prompt },
                {
                  inline_data: {
                    mime_type: request.image.mimeType,
                    data: Buffer.from(request.image.data).toString('base64'),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            // Constrains the model to one of the dataset's labels, so a
            // wrong answer is a wrong LABEL rather than unparseable prose.
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                label: {
                  type: 'STRING',
                  enum: VISION_LABELS,
                },
              },
              required: ['label'],
            },
            // A classification is not a creative task, and run-to-run
            // variance here would be measured as model instability.
            temperature: 0,
            candidateCount: 1,
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

      const payload = GeminiGenerateContentResponseSchema.safeParse(
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

      const candidate = payload.data.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('');

      // A 200 with no text is a real outcome, not a parse failure: safety
      // filtering and MAX_TOKENS both land here. Reported with the reason the
      // vendor gave, because "no answer" and "wrong answer" are different
      // failures and the evaluator must not score this as a wrong label.
      if (text.trim() === '') {
        const reason =
          payload.data.promptFeedback?.blockReason ??
          candidate?.finishReason ??
          'no reason given';

        return {
          rawOutput: '',
          latencyMs: this.clock() - startedAt,
          success: false,
          errorMessage: `Gemini returned no text (${reason}).`,
        };
      }

      return {
        rawOutput: normalizeGeminiOutput(text),
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
