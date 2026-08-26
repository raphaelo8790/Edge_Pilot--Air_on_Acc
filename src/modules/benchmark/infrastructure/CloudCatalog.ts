/**
 * EdgePilot AI - cloud provider model catalogues
 *
 * Answers "which models can this key actually run?" for Gemini and Groq, the
 * same question OllamaCatalog answers for the local runtime.
 *
 * Why it exists. The provider step used to say a cloud vendor "does not
 * publish its catalogue over the API" and fell back to a free-text box with a
 * hardcoded suggestion list. Both vendors do publish it, under the same key
 * used for generation, so a typed name that the vendor does not know - which
 * fails the whole run with `invalid_model` after the request has gone out -
 * is a guess nobody needs to make.
 *
 * THE KEY NEVER LEAVES THE SERVER. Both calls put it in a request header, not
 * the URL, so it cannot land in a log line. Only model names are returned to
 * the browser.
 *
 * Filtering is deliberate: Groq's list includes speech-to-text, text-to-speech
 * and guard models, and Gemini's includes embedding and image models. A
 * benchmark run here is a text generation, so the list is narrowed to models
 * that can answer one. Anything left out is counted, not hidden silently.
 */

import type { BenchmarkFetch } from './providers/http';

export type CloudProviderName = 'gemini' | 'groq';

export interface CloudModel {
  /** The exact id the provider expects in a generation request. */
  name: string;
  /** Vendor's human label when it gives one; otherwise the id. */
  displayName: string;
  /** Vendor-reported context window in tokens, when it reports one. */
  contextWindow: number | null;
  /**
   * Whether the model accepts an image alongside text. Gemini's generation
   * models all do; on Groq only the Llama 4 family does. Read from the id,
   * since neither vendor states it as a field.
   */
  supportsVision: boolean;
}

export interface CloudCatalogStatus {
  provider: CloudProviderName;
  ok: boolean;
  models: CloudModel[];
  /** Models the vendor listed that cannot run a text benchmark. */
  omittedCount: number;
  /** One line for the user. Actionable in every failure case. */
  message: string;
  /** What would fix it. Null when nothing is wrong. */
  remedy: string | null;
}

const LIST_TIMEOUT_MS = 5000;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export interface CloudCatalogOptions {
  provider: CloudProviderName;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: BenchmarkFetch;
}

async function getJson(
  fetchImpl: BenchmarkFetch,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ ok: true; body: unknown } | { ok: false; status: number | null; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal });

    if (!response.ok) {
      return { ok: false, status: response.status, reason: `HTTP ${response.status}` };
    }

    return { ok: true, body: await response.json() };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? `no response within ${timeoutMs} ms`
        : 'connection failed';

    return { ok: false, status: null, reason };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Groq — GET /openai/v1/models
// ---------------------------------------------------------------------------

interface GroqRawModel {
  id?: string;
  active?: boolean;
  context_window?: number;
}

/** Ids that are not chat models: audio in, audio out, or a safety classifier. */
const GROQ_NOT_CHAT = /whisper|tts|guard|moderation/i;

/** Groq ids that take an image: the Llama 4 family, and anything saying so. */
const GROQ_VISION = /llama-4|vision|maverick|scout/i;

function parseGroq(body: unknown): { models: CloudModel[]; omitted: number } {
  const data =
    body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: GroqRawModel[] }).data)
      : [];

  const models: CloudModel[] = [];
  let omitted = 0;

  for (const raw of data) {
    if (typeof raw.id !== 'string' || raw.id.length === 0) continue;

    if (raw.active === false || GROQ_NOT_CHAT.test(raw.id)) {
      omitted += 1;
      continue;
    }

    models.push({
      name: raw.id,
      displayName: raw.id,
      contextWindow: typeof raw.context_window === 'number' ? raw.context_window : null,
      supportsVision: GROQ_VISION.test(raw.id),
    });
  }

  return { models, omitted };
}

// ---------------------------------------------------------------------------
// Gemini — GET /v1beta/models (paginated)
// ---------------------------------------------------------------------------

interface GeminiRawModel {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
}

function parseGemini(body: unknown): {
  models: CloudModel[];
  omitted: number;
  nextPageToken: string | null;
} {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const list = Array.isArray(record.models) ? (record.models as GeminiRawModel[]) : [];

  const models: CloudModel[] = [];
  let omitted = 0;

  for (const raw of list) {
    if (typeof raw.name !== 'string' || raw.name.length === 0) continue;

    // Embedding, image and TTS models do not support generateContent, or do
    // but cannot answer a text prompt with text. The method list is the
    // vendor's own statement of what each one can do.
    const methods = raw.supportedGenerationMethods ?? [];
    const id = raw.name.replace(/^models\//, '');

    if (!methods.includes('generateContent') || /embedding|image|tts|aqa/i.test(id)) {
      omitted += 1;
      continue;
    }

    models.push({
      name: id,
      displayName: raw.displayName ?? id,
      contextWindow: typeof raw.inputTokenLimit === 'number' ? raw.inputTokenLimit : null,
      // Every gemini-* generation model is multimodal; the rest of what
      // passes the filter (gemma, learnlm) is text-only.
      supportsVision: /^gemini-/i.test(id),
    });
  }

  return {
    models,
    omitted,
    nextPageToken:
      typeof record.nextPageToken === 'string' && record.nextPageToken.length > 0
        ? record.nextPageToken
        : null,
  };
}

// ---------------------------------------------------------------------------

export class CloudCatalog {
  private readonly provider: CloudProviderName;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: BenchmarkFetch;

  constructor(options: CloudCatalogOptions) {
    this.provider = options.provider;
    this.apiKey = (options.apiKey ?? '').trim();
    this.baseUrl = (
      options.baseUrl ?? (options.provider === 'gemini' ? GEMINI_BASE_URL : GROQ_BASE_URL)
    ).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? LIST_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  public async status(): Promise<CloudCatalogStatus> {
    const label = this.provider === 'gemini' ? 'Gemini' : 'Groq';
    const envVar = this.provider === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY';

    if (this.apiKey.length === 0) {
      return {
        provider: this.provider,
        ok: false,
        models: [],
        omittedCount: 0,
        message: `${label} is not configured.`,
        remedy: `Set ${envVar} in .env (server-side only — never NEXT_PUBLIC_).`,
      };
    }

    const result =
      this.provider === 'gemini' ? await this.listGemini() : await this.listGroq();

    if (!result.ok) {
      const unauthorised = result.status === 401 || result.status === 403 || result.status === 400;

      return {
        provider: this.provider,
        ok: false,
        models: [],
        omittedCount: 0,
        message: `${label} did not list its models: ${result.reason}.`,
        remedy: unauthorised
          ? `Check that ${envVar} is a valid, current key for ${label}.`
          : `Check the connection to ${this.baseUrl} and try again.`,
      };
    }

    const sorted = result.models.sort((a, b) => a.name.localeCompare(b.name));

    return {
      provider: this.provider,
      ok: sorted.length > 0,
      models: sorted,
      omittedCount: result.omitted,
      message:
        sorted.length > 0
          ? `${label} lists ${sorted.length} text model${sorted.length === 1 ? '' : 's'} for this key.`
          : `${label} answered but listed no text model for this key.`,
      remedy:
        sorted.length > 0 ? null : `Check the ${label} console for which models this key may use.`,
    };
  }

  private async listGroq(): Promise<
    { ok: true; models: CloudModel[]; omitted: number } | { ok: false; status: number | null; reason: string }
  > {
    const response = await getJson(
      this.fetchImpl,
      `${this.baseUrl}/models`,
      { Authorization: `Bearer ${this.apiKey}` },
      this.timeoutMs
    );

    if (!response.ok) return response;

    return { ok: true, ...parseGroq(response.body) };
  }

  private async listGemini(): Promise<
    { ok: true; models: CloudModel[]; omitted: number } | { ok: false; status: number | null; reason: string }
  > {
    const models: CloudModel[] = [];
    let omitted = 0;
    let pageToken: string | null = null;
    // Gemini pages at 50 by default; a bound stops a misbehaving token from
    // looping forever.
    for (let page = 0; page < 10; page += 1) {
      const url = new URL(`${this.baseUrl}/models`);
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await getJson(
        this.fetchImpl,
        url.toString(),
        { 'x-goog-api-key': this.apiKey },
        this.timeoutMs
      );

      if (!response.ok) return response;

      const parsed = parseGemini(response.body);
      models.push(...parsed.models);
      omitted += parsed.omitted;
      pageToken = parsed.nextPageToken;

      if (pageToken === null) break;
    }

    return { ok: true, models, omitted };
  }
}
