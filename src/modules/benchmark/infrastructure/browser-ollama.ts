/**
 * EdgePilot AI - the visitor's own Ollama, reached from their browser tab
 *
 * WHY THIS FILE EXISTS. Every other Ollama call in this module runs on the
 * server and reads OLLAMA_HOST. On a laptop that is fine: the server and the
 * browser are the same machine, so "localhost" means the same thing to both.
 * Hosted, it is not fine at all: the server's "localhost" is a container in
 * a datacentre with no Ollama in it, and a server cannot reach a visitor's
 * laptop. The only thing that can is the page running in their browser.
 *
 * So this file does, from the tab, what `OllamaCatalog`, `OllamaProvider`
 * and `OllamaResidencyProbe` do from the server. It reuses those classes
 * unchanged - they are plain `fetch` code with no server dependency - and
 * only adds the two things a browser needs on top:
 *
 *   1. A remedy that mentions CORS. From an https page, a request to
 *      http://localhost is allowed (loopback is a trustworthy origin), but
 *      Ollama refuses it unless the page's origin is in OLLAMA_ORIGINS. The
 *      failure looks identical to "Ollama is not running", so the message
 *      says both.
 *   2. Packaging the measurements so the server can score them. The
 *      scoring, storage and session log stay server-side; see
 *      RecordedProvider for why.
 *
 * NOTHING HERE READS process.env. This file is imported by client
 * components, and `infrastructure/config.ts` refuses to load in a browser
 * for exactly that reason.
 */

import { OllamaCatalog } from './OllamaCatalog';
import { OllamaProvider } from './providers/OllamaProvider';
import { OllamaResidencyProbe } from './OllamaResidencyProbe';
import type { RecordedMeasurement } from '../application/dtos/BenchmarkRequest';
import { toLocalRuntimeDto, type LocalRuntimeDto } from '../application/dtos/LocalRuntime';

/**
 * Where a visitor's Ollama listens by default. The same value the server
 * default uses, but on the visitor's side of the wire.
 */
export const BROWSER_OLLAMA_HOST = 'http://localhost:11434';

/** True when the page itself is served from localhost (developer laptop). */
function pageIsLocal(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * The line a visitor needs when the tab could not reach Ollama. On a
 * developer laptop it is "start it"; on the hosted site it is also "let this
 * origin in", because a running Ollama that rejects the origin fails the
 * same way as one that is not running.
 */
export function browserOllamaRemedy(host: string): string {
  const start = `Start Ollama on this computer (ollama serve), listening on ${host}.`;

  if (pageIsLocal()) return start;

  const origin = typeof window === 'undefined' ? 'this site' : window.location.origin;
  return (
    `${start} Then allow this site to talk to it: set OLLAMA_ORIGINS=${origin} ` +
    `in Ollama's environment and restart it. Without that, the browser blocks the request before Ollama sees it.`
  );
}

/**
 * Is the visitor's Ollama running, and what does it have? Same shape as
 * GET /api/v1/local-runtime, so every panel that read the server's answer
 * can read this one instead.
 */
export async function probeBrowserOllama(
  host: string = BROWSER_OLLAMA_HOST
): Promise<LocalRuntimeDto> {
  const status = await new OllamaCatalog({ host }).status();
  const dto = toLocalRuntimeDto(status);

  if (dto.state === 'unreachable') {
    return {
      ...dto,
      message: `Nothing answered at ${host} from this browser.`,
      remedy: browserOllamaRemedy(host),
    };
  }

  return dto;
}

export interface BrowserMeasurementRequest {
  host?: string;
  model: string;
  prompt: string;
  /** Measured iterations; one extra cold-start call is made and marked as such. */
  iterations: number;
  timeoutMs?: number;
}

/**
 * Runs the benchmark from the tab against the visitor's Ollama and returns
 * it in the shape POST /api/v1/benchmarks accepts as `recorded`.
 *
 * The sequence is the one BenchmarkRunner follows when it measures itself:
 * read residency, make iterations + 1 calls, read residency again. Keeping
 * the sequence identical is what makes a browser run and a server run
 * comparable rows in the same table.
 */
export async function measureInBrowser(
  request: BrowserMeasurementRequest
): Promise<RecordedMeasurement> {
  const host = (request.host ?? BROWSER_OLLAMA_HOST).replace(/\/+$/, '');
  const probe = new OllamaResidencyProbe({ host });
  const provider = new OllamaProvider({
    host,
    timeoutMs: request.timeoutMs,
    fetchImplementation: (input, init) => fetch(input, init),
  });

  const before = await probe.observe(request.model).catch(() => null);
  const responses = await provider.measure(
    request.prompt,
    request.model,
    request.iterations + 1
  );
  const after = await probe.observe(request.model).catch(() => null);

  return {
    host,
    responses: responses.map((response) => ({
      text: response.text,
      latency_ms: response.latency_ms,
      tokens_per_second: response.tokens_per_second,
      ttft_ms: response.ttft_ms,
      success: response.success,
      error_message: response.error_message,
      usage: response.usage,
      provenance: response.provenance,
      failureCode: response.failureCode,
    })),
    resident_before: before,
    resident_after: after,
  };
}
