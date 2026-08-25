/**
 * The error vocabulary is a published contract: docs/local-model-setup.md
 * lists these codes and the API returns their statuses. These tests are what
 * stops the code and the document drifting apart.
 */

import {
  allProviderErrorCodes,
  classifyHttpStatus,
  classifyTransportError,
  decodeFailure,
  describeProviderError,
  encodeFailure,
  isRetryableProviderError,
  providerErrorStatus,
} from '@/modules/benchmark/infrastructure/providers/errors';

describe('provider error vocabulary', () => {
  it('describes every code with a status, a retry policy and an explanation', () => {
    const codes = allProviderErrorCodes();

    expect(codes).toHaveLength(8);

    for (const code of codes) {
      const description = describeProviderError(code);

      expect(description.status).toBeGreaterThanOrEqual(400);
      expect(description.status).toBeLessThan(600);
      expect(typeof description.retryable).toBe('boolean');
      expect(description.explanation.length).toBeGreaterThan(20);
    }
  });

  it('does not fall back on a request error or a rejected credential', () => {
    // Trying a second provider after these would either answer a different
    // question or hide a configuration fault.
    expect(isRetryableProviderError('invalid_model')).toBe(false);
    expect(isRetryableProviderError('unauthorized')).toBe(false);
  });

  it('falls back on a failure another provider might not share', () => {
    expect(isRetryableProviderError('timeout')).toBe(true);
    expect(isRetryableProviderError('local_unavailable')).toBe(true);
    expect(isRetryableProviderError('rate_limited')).toBe(true);
    expect(isRetryableProviderError('not_configured')).toBe(true);
  });

  it('maps codes onto the documented statuses', () => {
    expect(providerErrorStatus('timeout')).toBe(504);
    expect(providerErrorStatus('local_unavailable')).toBe(503);
    expect(providerErrorStatus('invalid_model')).toBe(422);
    expect(providerErrorStatus('rate_limited')).toBe(429);
  });
});

describe('failure encoding', () => {
  it('round-trips a failure through the single error_message string', () => {
    const failure = { code: 'timeout' as const, message: 'Took too long.' };

    expect(decodeFailure(encodeFailure(failure))).toEqual(failure);
  });

  it('treats an unrecognised prefix as a generic provider error', () => {
    const decoded = decodeFailure('something: went wrong');

    expect(decoded).toEqual({
      code: 'provider_error',
      message: 'something: went wrong',
    });
  });

  it('returns null for no error at all', () => {
    expect(decodeFailure(null)).toBeNull();
  });
});

describe('transport classification', () => {
  it('reads an abort as our own timeout', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';

    expect(classifyTransportError(error, { local: true }).code).toBe('timeout');
    expect(classifyTransportError(error, { local: false }).code).toBe(
      'timeout'
    );
  });

  it('reads a refused connection to a local provider as an unavailable runtime', () => {
    const error = new TypeError('fetch failed');
    (error as { cause?: { code: string } }).cause = { code: 'ECONNREFUSED' };

    expect(classifyTransportError(error, { local: true }).code).toBe(
      'local_unavailable'
    );
  });

  it('does not blame the local runtime for a cloud provider', () => {
    const error = new TypeError('fetch failed');
    (error as { cause?: { code: string } }).cause = { code: 'ECONNREFUSED' };

    expect(classifyTransportError(error, { local: false }).code).toBe(
      'provider_error'
    );
  });
});

describe('HTTP status classification', () => {
  it('maps authentication failures', () => {
    expect(classifyHttpStatus(401, 'bad key').code).toBe('unauthorized');
    expect(classifyHttpStatus(403, 'forbidden').code).toBe('unauthorized');
  });

  it('maps rate limits', () => {
    expect(classifyHttpStatus(429, 'slow down').code).toBe('rate_limited');
  });

  it('maps a missing model', () => {
    expect(classifyHttpStatus(404, 'model "nope" not found').code).toBe(
      'invalid_model'
    );
  });

  it('falls through to a generic provider error', () => {
    expect(classifyHttpStatus(500, 'internal').code).toBe('provider_error');
  });
});
