/**
 * The documented failure vocabulary of the benchmark layer.
 *
 * Every provider failure is mapped onto one of these codes before it leaves an
 * adapter. Nothing throws across the module boundary: a failed iteration is
 * still a measurement, and the reliability score counts it.
 */

export type ProviderErrorCode =
  /** The call exceeded the configured per-request timeout. */
  | 'timeout'
  /** The local runtime (Ollama) is not reachable on the configured host. */
  | 'local_unavailable'
  /** The provider rejected the model name, or the model is not installed. */
  | 'invalid_model'
  /** The API key is missing, malformed, or rejected. */
  | 'unauthorized'
  /** The provider applied a rate limit or quota. */
  | 'rate_limited'
  /** The provider answered, but the payload did not match the expected shape. */
  | 'invalid_response'
  /** The provider is not configured in this environment (no key, no host). */
  | 'not_configured'
  /** Anything else the provider reported. */
  | 'provider_error';

export interface ProviderFailure {
  code: ProviderErrorCode;
  message: string;
}

interface ProviderErrorDescription {
  /** HTTP status the API route returns for this code. */
  status: number;
  /** Whether the runner may try the next provider in the fallback chain. */
  retryable: boolean;
  /** Operator-facing explanation, published in docs/local-model-setup.md. */
  explanation: string;
}

const DESCRIPTIONS: Record<ProviderErrorCode, ProviderErrorDescription> = {
  timeout: {
    status: 504,
    retryable: true,
    explanation:
      'The provider did not answer within BENCHMARK_TIMEOUT_MS. The request was aborted; no partial result is recorded as measured.',
  },
  local_unavailable: {
    status: 503,
    retryable: true,
    explanation:
      'Nothing is listening on OLLAMA_HOST. Start the runtime (docker compose --profile ollama up -d) or correct the host.',
  },
  invalid_model: {
    status: 422,
    retryable: false,
    explanation:
      'The model name is not available on that provider. This is a request error, so the runner does not fall back — a different provider would not make the name correct.',
  },
  unauthorized: {
    status: 502,
    retryable: false,
    explanation:
      'The provider rejected the credential. Fix the key in .env; falling back would hide a configuration fault.',
  },
  rate_limited: {
    status: 429,
    retryable: true,
    explanation:
      'The provider applied a rate limit or quota. The runner may fall back to another provider.',
  },
  invalid_response: {
    status: 502,
    retryable: true,
    explanation:
      'The provider answered with a payload that failed schema validation. Treated as a provider fault, not as a measurement.',
  },
  not_configured: {
    status: 503,
    retryable: true,
    explanation:
      'This provider has no credential or host in the current environment, so it was never called.',
  },
  provider_error: {
    status: 502,
    retryable: true,
    explanation:
      'The provider returned an error that does not map onto a more specific code.',
  },
};

export function describeProviderError(
  code: ProviderErrorCode
): ProviderErrorDescription {
  return DESCRIPTIONS[code];
}

export function isRetryableProviderError(code: ProviderErrorCode): boolean {
  return DESCRIPTIONS[code].retryable;
}

export function providerErrorStatus(code: ProviderErrorCode): number {
  return DESCRIPTIONS[code].status;
}

/** Every documented code, for the API contract doc and the evidence capture. */
export function allProviderErrorCodes(): ProviderErrorCode[] {
  return Object.keys(DESCRIPTIONS) as ProviderErrorCode[];
}

/**
 * Encodes a failure into the single `error_message` string the shared
 * AIProvider port exposes, so the code survives to the runner without changing
 * a contract another member owns.
 */
export function encodeFailure(failure: ProviderFailure): string {
  return `${failure.code}: ${failure.message}`;
}

export function decodeFailure(
  errorMessage: string | null
): ProviderFailure | null {
  if (!errorMessage) {
    return null;
  }

  const separator = errorMessage.indexOf(':');

  if (separator === -1) {
    return { code: 'provider_error', message: errorMessage };
  }

  const candidate = errorMessage.slice(0, separator).trim();
  const message = errorMessage.slice(separator + 1).trim();

  if (Object.prototype.hasOwnProperty.call(DESCRIPTIONS, candidate)) {
    return { code: candidate as ProviderErrorCode, message };
  }

  return { code: 'provider_error', message: errorMessage };
}

/**
 * Classifies a thrown transport error. An AbortError is our own timeout; a
 * connection refusal means the local runtime is down.
 */
export function classifyTransportError(
  error: unknown,
  options: { local: boolean }
): ProviderFailure {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return { code: 'timeout', message: 'Request aborted after timeout.' };
    }

    const cause = (error as { cause?: { code?: string } }).cause;
    const systemCode = cause?.code ?? '';

    if (
      options.local &&
      (systemCode === 'ECONNREFUSED' ||
        systemCode === 'ENOTFOUND' ||
        systemCode === 'EHOSTUNREACH' ||
        /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(error.message))
    ) {
      return {
        code: 'local_unavailable',
        message: 'Could not connect to the local model runtime.',
      };
    }

    return { code: 'provider_error', message: error.message };
  }

  return { code: 'provider_error', message: 'Unknown provider error.' };
}

/** Maps an HTTP status onto the closest documented code. */
export function classifyHttpStatus(
  status: number,
  body: string
): ProviderFailure {
  if (status === 401 || status === 403) {
    return { code: 'unauthorized', message: body };
  }

  if (status === 429) {
    return { code: 'rate_limited', message: body };
  }

  if (status === 404 || /model/i.test(body)) {
    if (status === 404 || status === 400 || status === 422) {
      return { code: 'invalid_model', message: body };
    }
  }

  return { code: 'provider_error', message: body };
}
