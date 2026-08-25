export type VisionFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export type MillisecondClock = () => number;

export const systemMillisecondClock: MillisecondClock = () =>
  performance.now();

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
      return payload.error;
    }

    if (
      typeof payload.error === 'object' &&
      typeof payload.error?.message === 'string'
    ) {
      return payload.error.message;
    }

    return payload.message ?? fallback;
  } catch {
    return fallback;
  }
}
