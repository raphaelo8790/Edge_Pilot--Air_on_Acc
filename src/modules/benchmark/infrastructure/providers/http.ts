/**
 * Transport helpers shared by the benchmark provider adapters.
 *
 * `fetch` and the clock are injected rather than reached for directly so that
 * every adapter can be unit tested without a network or a real timer. The
 * vision-benchmark module uses the same pattern; this is a deliberate copy
 * rather than an import, because the two modules must be able to change
 * independently.
 */

export type BenchmarkFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export type MillisecondClock = () => number;

export const systemMillisecondClock: MillisecondClock = () =>
  performance.now();

/**
 * Best-effort extraction of a human-readable message from a provider's error
 * body. Falls back to the status line when the body is absent or not JSON.
 *
 * The returned string is surfaced to the client, so it must never contain a
 * credential. Provider error bodies do not echo API keys, and the adapters
 * never place the key in a URL or a request body — only in a header.
 */
export async function readProviderError(
  response: Response
): Promise<string> {
  const fallback = `HTTP ${response.status} ${response.statusText}`.trim();

  try {
    const payload = (await response.json()) as {
      error?: string | { message?: string };
      message?: string;
    };

    if (typeof payload.error === 'string') {
      return payload.error || fallback;
    }

    if (
      typeof payload.error === 'object' &&
      typeof payload.error?.message === 'string'
    ) {
      return payload.error.message || fallback;
    }

    return payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Reads a streamed body and hands every complete line to `onLine`.
 *
 * Written with an explicit reader loop rather than `for await`, because the
 * repository compiles with `target: es5` and async iteration over a
 * ReadableStream is not reliably downlevelled.
 */
export async function readLineDelimitedStream(
  body: ReadableStream<Uint8Array> | null,
  onLine: (line: string) => void
): Promise<void> {
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      buffer += decoder.decode(chunk.value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          onLine(line);
        }

        newlineIndex = buffer.indexOf('\n');
      }
    }

    const trailing = buffer.trim();

    if (trailing.length > 0) {
      onLine(trailing);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Server-Sent Events carry their payload on `data:` lines. `[DONE]` is the
 * OpenAI-style terminator and carries no JSON.
 */
export function parseServerSentEventData(line: string): string | null {
  if (!line.startsWith('data:')) {
    return null;
  }

  const payload = line.slice('data:'.length).trim();

  if (payload.length === 0 || payload === '[DONE]') {
    return null;
  }

  return payload;
}

/**
 * Tokens per second derived from a token count and a duration.
 *
 * Returns null rather than 0 or a guess whenever the inputs cannot support a
 * real figure — an unmeasured throughput must stay unmeasured.
 */
export function tokensPerSecond(
  tokenCount: number | null | undefined,
  durationMs: number | null | undefined
): number | null {
  if (
    typeof tokenCount !== 'number' ||
    typeof durationMs !== 'number' ||
    !isFinite(tokenCount) ||
    !isFinite(durationMs) ||
    tokenCount <= 0 ||
    durationMs <= 0
  ) {
    return null;
  }

  return Number(((tokenCount / durationMs) * 1000).toFixed(3));
}
