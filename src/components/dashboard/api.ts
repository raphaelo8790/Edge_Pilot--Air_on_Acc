/**
 * Typed client for the /api/v1 wire contract — the single place the
 * dashboard talks to the backend.
 *
 * Authoritative contract: docs/internal/benchmark-api.md (benchmark module,
 * owner Adham) and src/shared/types/* (scaffold schemas). Validation happens
 * server-side with zod; this client's job is to speak the envelope
 * ({ success, data } / { success, false, error, details }) and normalise
 * network failures into the same shape, so components render exactly one
 * error form.
 *
 * NOTE for reviewers: types are imported with `import type` from the
 * benchmark module's DTOs so the dashboard cannot drift from the measurement
 * envelope — and type-only imports are erased at build time, so this adds no
 * runtime coupling to the module's internals.
 */
import type {
  BenchmarkRun,
} from "@/modules/benchmark/application/dtos/BenchmarkMeasurement";
import type { BenchmarkRequest } from "@/modules/benchmark/application/dtos/BenchmarkRequest";

// ---------------------------------------------------------------------------
// Wire shapes not exported by other modules (documented in benchmark-api.md)
// ---------------------------------------------------------------------------

export interface ProviderCatalogEntry {
  provider_id: string | null;
  name: "ollama" | "gemini" | "groq" | string;
  type: "local" | "cloud";
  base_url: string | null;
  is_active: boolean;
  display_name: string;
  is_configured: boolean;
  configuration_hint: string | null;
  privacy_level: string;
  reports_ttft: boolean;
  reports_output_tokens: boolean;
  official_source: string;
  in_catalog: boolean;
}

export interface ProvidersMeta {
  database_available: boolean;
  configuration_warnings: string[];
  message?: string;
}

/** GET /api/v1/readiness/[id] — camelCase, with ASSUMPTION: lines split out. */
export interface ReadinessRecord {
  hardwareFit: number;
  latencyScore: number;
  privacyScore: number;
  costScore: number;
  reliabilityScore: number;
  overallReadiness: number;
  recommendation: string;
  evidence: string[];
  limitations: string[];
  assumptions: string[];
}

export interface CreateWorkloadInput {
  task_type:
    | "text_generation"
    | "code_generation"
    | "image_recognition"
    | "multimodal";
  input_format: string;
  output_format: string;
  constraints: Record<string, unknown>;
}

export interface CreateDeviceInput {
  name: string;
  cpu: string;
  ram_gb: number;
  gpu: string | null;
  storage_gb: number;
  network: string | null;
}

// ---------------------------------------------------------------------------
// Envelope handling
// ---------------------------------------------------------------------------

export interface ApiFailure {
  ok: false;
  status: number;
  error: string;
  /** Zod issue array or a plain string, verbatim from the server. */
  details?: unknown;
  /** Present on the "All providers failed" case — the run is still evidence. */
  failedRun?: BenchmarkRun;
}

export interface ApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
  message?: string;
  meta?: unknown;
}

export type ApiOutcome<T> = ApiSuccess<T> | ApiFailure;

async function call<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiOutcome<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Network error",
      details:
        "Could not reach the EdgePilot server. Is `npm run dev` running?",
    };
  }

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: "Invalid response",
      details: "The server did not answer with JSON.",
    };
  }

  if (body.success === true) {
    return {
      ok: true,
      status: res.status,
      data: body.data as T,
      message: typeof body.message === "string" ? body.message : undefined,
      meta: body.meta,
    };
  }

  return {
    ok: false,
    status: res.status,
    error: typeof body.error === "string" ? body.error : "Unknown error",
    details: body.details,
    // "All providers failed" carries the full run in data — keep it, it is
    // real evidence (see benchmark-api.md).
    failedRun: body.data ? (body.data as BenchmarkRun) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export function getProviders() {
  return call<ProviderCatalogEntry[]>("/providers");
}

export function createWorkload(input: CreateWorkloadInput) {
  return call<{ workload_id: string } & CreateWorkloadInput>("/workloads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createDevice(input: CreateDeviceInput) {
  return call<{ device_id: string } & CreateDeviceInput>("/devices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** The long call — a run is iterations × real inference. */
export function runBenchmark(input: BenchmarkRequest) {
  return call<BenchmarkRun>("/benchmarks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getReadiness(benchmarkId: string) {
  return call<ReadinessRecord>(`/readiness/${benchmarkId}`);
}

export function getBenchmarkById(benchmarkId: string) {
  return call<{
    benchmark: unknown;
    results: unknown[];
    readiness: unknown;
  }>(`/benchmarks?benchmark_id=${encodeURIComponent(benchmarkId)}`);
}

export type { BenchmarkRun, BenchmarkRequest };
