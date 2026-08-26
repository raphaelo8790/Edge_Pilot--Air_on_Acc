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
import type { BenchmarkRunOutcome } from "@/modules/benchmark/application/services/BenchmarkRunner";
import type { ComparisonReport } from "@/modules/benchmark/core/services/ComparisonReport";
import type { Modality, ModalityConfidence } from "@/modules/benchmark/core/services/ModelModality";
import type { ProviderTier } from "@/modules/benchmark/core/services/PrivacyAssessor";
import { getSessionId } from "./session";

/**
 * Must match SESSION_HEADER in src/core/logging/sessionLogStore.ts. It is
 * written out rather than imported: that module instantiates the in-memory
 * log store at module scope, so importing it here would pull server-side
 * state into the browser bundle.
 */
const SESSION_HEADER = "x-edgepilot-session";

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
  /** Null when hardware fit could not be assessed. */
  hardwareFit: number | null;
  latencyScore: number;
  /** Null for runs scored after privacy became a class. */
  privacyScore: number | null;
  /** Ordinal privacy class, e.g. "on-device". Null on historic rows. */
  privacyClass: string | null;
  costScore: number;
  reliabilityScore: number;
  overallReadiness: number;
  recommendation: string;
  evidence: string[];
  limitations: string[];
  assumptions: string[];
}

/** One model installed on the machine running Ollama. */
export interface LocalModel {
  name: string;
  size_bytes: number | null;
  parameter_size: string | null;
  quantization: string | null;
  families: string[];
  modality: "text" | "vision" | "embedding";
  modality_confidence: "reported" | "inferred";
  modality_reason: string;
  /**
   * Loaded in memory right now. False means installed but asleep — the next
   * call pays a cold start. Null when the runtime could not be asked.
   */
  resident: boolean | null;
}

export interface LocalRuntime {
  provider: string;
  state:
    | "ready"
    | "reachable-no-models"
    | "unreachable"
    | "bad-host"
    | "not-configured";
  ok: boolean;
  host: string | null;
  version: string | null;
  message: string;
  remedy: string | null;
  model_count: number;
  models: LocalModel[];
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
  const sessionId = getSessionId();

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        // Every call carries the browser's own id. This is what makes rows
        // created here belong to this visitor instead of to a shared
        // sandbox user, and it is why no component ever handles a uuid.
        // Omitted during server rendering, where there is no identity.
        ...(sessionId === null ? {} : { [SESSION_HEADER]: sessionId }),
        ...init?.headers,
      },
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
    // One route (/workloads 503) keys its explanation `detail`, every other
    // route uses `details`, and /readiness/[id] 404 uses `message`. The wire
    // is inconsistent; the client is not.
    details: body.details ?? body.detail ?? body.message,
    // Three failures ship data alongside success:false — "All providers
    // failed" (the full run), "Comparison refused" ({plan}) and the share
    // "Confirmation required" preview. Kept verbatim; the caller knows which
    // shape it asked for.
    failedRun: body.data ? (body.data as BenchmarkRun) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export function getLocalRuntime() {
  return call<LocalRuntime>("/local-runtime");
}

export function getProviders() {
  return call<ProviderCatalogEntry[]>("/providers");
}

export function createWorkload(input: CreateWorkloadInput) {
  return call<{ workload_id: string } & CreateWorkloadInput>("/workloads", {
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

// ---------------------------------------------------------------------------
// Comparisons — POST /api/v1/comparisons
//
// Wire quirk the types below encode deliberately: `plan` is serialised to
// snake_case by the route, while `report` and `outcomes` are the domain
// objects verbatim (camelCase), and `outcome.results`/`outcome.summary`
// inside them are snake_case again. Nothing is persisted server-side.
// ---------------------------------------------------------------------------

export interface ComparisonEntrantInput {
  provider: string;
  model: string;
  /** Declared, never detected — free tiers commonly train on input. */
  tier?: ProviderTier;
}

export interface ComparisonPlanEntrantDto {
  provider: string;
  model: string;
  provider_type: "local" | "cloud";
  modality: Modality;
  modality_confidence: ModalityConfidence;
  modality_reason: string;
}

export interface ComparisonPlanDto {
  mode: "parallel" | "sequential";
  mode_reason: string;
  modality: Modality | null;
  caveats: string[];
  entrants: ComparisonPlanEntrantDto[];
}

export interface ComparisonOutcomeDto {
  label: string;
  outcome: BenchmarkRunOutcome;
  parametersBillions: number | null;
}

export interface ComparisonResultDto {
  session_logged: boolean;
  correlation_id: string;
  plan: ComparisonPlanDto;
  report: ComparisonReport;
  outcomes: ComparisonOutcomeDto[];
}

/** The longest call in the app: up to 4 entrants × (iterations + 1) real runs. */
export function runComparison(input: {
  entrants: ComparisonEntrantInput[];
  prompt: string;
  iterations: number;
}) {
  return call<ComparisonResultDto>("/comparisons", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Session log — populated only by comparison runs. GET returns a raw download
// document rather than the API envelope, so it gets its own fetch path.
// ---------------------------------------------------------------------------

export interface SharePreview {
  consent_statement: string;
  would_send: {
    schema: string;
    session_id: string;
    event_count: number;
    disclosure: string[];
    events: unknown[];
  };
}

export async function downloadSessionLog(): Promise<ApiFailure | null> {
  const sessionId = getSessionId();
  if (sessionId === null) {
    return { ok: false, status: 0, error: "No session id in this browser" };
  }
  let res: Response;
  try {
    res = await fetch("/api/v1/session-log", {
      headers: { [SESSION_HEADER]: sessionId },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Network error",
      details: "Could not reach the EdgePilot server. Is `npm run dev` running?",
    };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: false,
      status: res.status,
      error: typeof body.error === "string" ? body.error : "Export failed",
      details: body.details,
    };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `edgepilot-session-${sessionId}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

export function discardSessionLog() {
  return call<{ session_id: string; discarded: boolean }>("/session-log", {
    method: "DELETE",
  });
}

export function getSharePreview() {
  return call<SharePreview>("/session-log/share");
}

export function shareSessionLog(note?: string) {
  return call<{ shared_id: string; shared_at: string; event_count: number }>(
    "/session-log/share",
    {
      method: "POST",
      body: JSON.stringify(note ? { confirm: true, note } : { confirm: true }),
    },
  );
}

// ---------------------------------------------------------------------------
// Database health
// ---------------------------------------------------------------------------

export interface DatabaseHealth {
  connected: boolean;
  configured: boolean;
  /** Host and database NAME only, and withheld entirely in production. */
  host: string | null;
  database: string | null;
  pooled: boolean | null;
  ssl: boolean | null;
  round_trip_ms: number | null;
  migrations: {
    applied: number;
    pending_rollback: number;
    latest: string | null;
    latest_at: string | null;
  } | null;
  /** Counts only. Never rows. Null when the tables could not be read. */
  rows: Record<string, number> | null;
}

/**
 * Asks the server whether it can actually reach its database.
 *
 * The failure case is not thrown away: a 503 here still carries the diagnosis
 * in `data`, which is the whole point of the endpoint, so the caller gets the
 * failure shape rather than a bare error string.
 */
export function getDatabaseHealth() {
  return call<DatabaseHealth>("/health/database");
}

export type { BenchmarkRun, BenchmarkRequest, BenchmarkRunOutcome, ComparisonReport };
