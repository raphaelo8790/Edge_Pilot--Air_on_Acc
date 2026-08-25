/**
 * EdgePilot AI - local runtime status and model catalogue
 *
 * Answers two questions before a run rather than after it:
 *
 *   1. Is Ollama actually running on the configured host?
 *   2. Which models does this machine have?
 *
 * Why it exists. `OllamaProvider.isConfigured()` only reports whether a host
 * string is set - by design, since whether anything is listening is a runtime
 * question. The consequence was that a user with Ollama stopped, or on the
 * wrong port, learned about it from a failed benchmark rather than from the
 * screen where they chose the provider. And nobody could see which models
 * they had without leaving the app.
 *
 * Every failure returns an actionable message naming the host that was tried
 * and the command that fixes it, in the same spirit as the provider error
 * taxonomy: never "connection failed", always what to do about it.
 */

export type LocalRuntimeState =
  | 'ready'
  | 'reachable-no-models'
  | 'unreachable'
  | 'not-configured'
  | 'bad-host';

export interface LocalModel {
  name: string;
  sizeBytes: number | null;
  /** e.g. "7.2B", straight from the runtime. */
  parameterSize: string | null;
  /** e.g. "Q4_K_M". */
  quantization: string | null;
  /** Model families the runtime reports, e.g. ["llama"]. */
  families: string[];
}

export interface LocalRuntimeStatus {
  state: LocalRuntimeState;
  ok: boolean;
  host: string;
  /** Ollama's own version string, when it answered. */
  version: string | null;
  models: LocalModel[];
  /** One line for the user. Actionable in every failure case. */
  message: string;
  /** The command or change that would fix it. Null when nothing is wrong. */
  remedy: string | null;
}

const STATUS_TIMEOUT_MS = 3000;
const DEFAULT_HOST = 'http://localhost:11434';

async function getJson(
  url: string,
  timeoutMs: number
): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }

    return { ok: true, body: await response.json() };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? `no response within ${timeoutMs} ms`
        : 'connection refused';

    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

interface RawTag {
  name?: string;
  size?: number;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    families?: string[];
    family?: string;
  };
}

function toModel(raw: RawTag): LocalModel {
  const families =
    raw.details?.families ??
    (raw.details?.family ? [raw.details.family] : []);

  return {
    name: raw.name ?? 'unknown',
    sizeBytes: typeof raw.size === 'number' ? raw.size : null,
    parameterSize: raw.details?.parameter_size ?? null,
    quantization: raw.details?.quantization_level ?? null,
    families,
  };
}

export interface OllamaCatalogOptions {
  host: string;
  timeoutMs?: number;
}

export class OllamaCatalog {
  private readonly host: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaCatalogOptions) {
    this.host = (options.host ?? '').trim().replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? STATUS_TIMEOUT_MS;
  }

  public async status(): Promise<LocalRuntimeStatus> {
    const base: Omit<LocalRuntimeStatus, 'state' | 'ok' | 'message' | 'remedy'> =
      { host: this.host, version: null, models: [] };

    if (this.host.length === 0) {
      return {
        ...base,
        state: 'not-configured',
        ok: false,
        message: 'No local runtime host is configured.',
        remedy: `Set OLLAMA_HOST in .env. The default is ${DEFAULT_HOST}.`,
      };
    }

    // A malformed host is a different problem from an unreachable one and
    // deserves a different message. Note that `new URL('localhost:11434')`
    // does NOT throw - it parses "localhost:" as the protocol - so the scheme
    // has to be checked explicitly. Without this, forgetting "http://" gets
    // reported as "start Ollama", which sends the user to fix the wrong thing.
    let parsed: URL | null = null;

    try {
      parsed = new URL(this.host);
    } catch {
      parsed = null;
    }

    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      return {
        ...base,
        state: 'bad-host',
        ok: false,
        message: `"${this.host}" is not a valid URL.`,
        remedy: `Set OLLAMA_HOST to a full URL including the scheme, for example ${DEFAULT_HOST}.`,
      };
    }

    const version = await getJson(`${this.host}/api/version`, this.timeoutMs);

    if (!version.ok) {
      return {
        ...base,
        state: 'unreachable',
        ok: false,
        message: `Nothing answered at ${this.host} (${version.reason}).`,
        remedy:
          `Start the runtime with \`ollama serve\`, then confirm with ` +
          `\`curl ${this.host}/api/version\`. If Ollama is on another machine ` +
          `or port, set OLLAMA_HOST to match.`,
      };
    }

    const versionString =
      version.body &&
      typeof version.body === 'object' &&
      typeof (version.body as { version?: unknown }).version === 'string'
        ? (version.body as { version: string }).version
        : null;

    const tags = await getJson(`${this.host}/api/tags`, this.timeoutMs);

    const rawModels =
      tags.ok &&
      tags.body &&
      typeof tags.body === 'object' &&
      Array.isArray((tags.body as { models?: unknown }).models)
        ? ((tags.body as { models: RawTag[] }).models)
        : [];

    const models = rawModels
      .map(toModel)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (models.length === 0) {
      return {
        ...base,
        version: versionString,
        state: 'reachable-no-models',
        ok: false,
        message: `Ollama ${versionString ?? ''} is running at ${this.host} but has no models installed.`.replace(
          /\s+/g,
          ' '
        ),
        remedy:
          'Pull one before benchmarking, for example `ollama pull llama3.2`.',
      };
    }

    return {
      ...base,
      version: versionString,
      models,
      state: 'ready',
      ok: true,
      message: `Ollama ${versionString ?? ''} is running at ${this.host} with ${models.length} model${models.length === 1 ? '' : 's'} installed.`.replace(
        /\s+/g,
        ' '
      ),
      remedy: null,
    };
  }
}
