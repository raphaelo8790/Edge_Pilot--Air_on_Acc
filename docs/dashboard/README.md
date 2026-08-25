# Benchmark Dashboard — module documentation

Owner: **Kareem Ehab** (Product UI & Benchmark Dashboard Engineer /
Integration Lead). Route: **`/dashboard`**. Branch: `feature/4-dashboard-ui`.

## What it is

The complete user journey over the team's real `/api/v1` backend:

1. **Workload & device** — registers rows via the scaffold endpoints and
   collects the two UUIDs a run must reference.
2. **Provider & model** — live catalog from `GET /api/v1/providers`,
   including `is_configured`, `configuration_hint`, database availability and
   server configuration warnings, rendered honestly (unconfigured providers
   are visible but not selectable).
3. **Run** — `POST /api/v1/benchmarks` with a controlled task prompt (from
   `benchmark-tasks.json`, text/code tasks; vision tasks belong to the vision
   dashboard), 1–100 iterations, elapsed-time feedback for long runs.
4. **Results** — the full measurement envelope: per-iteration table with
   provenance badges (measured / derived / not-reported / simulated),
   nullable-honest summary tiles ("not measured", never 0), the fallback
   chain when used, readiness score + stored breakdown from
   `GET /api/v1/readiness/[id]`, evidence, **assumptions** (highlighted), and
   limitations, plus JSON export of the run.

Wire contract consumed: `docs/internal/benchmark-api.md` — thank you, it is
written against exactly, including the "all providers failed but the run is
still evidence" case (the dashboard renders that run with a failure banner
instead of discarding it) and `persisted: false` (banner + export prompt).

## Design decisions

- **One typed gateway** (`src/components/dashboard/api.ts`): every request
  goes through one function that speaks the `{ success, data }` envelope and
  normalises network failures into it, so components render exactly one error
  shape. Types come from the benchmark module's DTOs via `import type`
  (erased at build time — no runtime coupling).
- **Module-scoped styling** (`src/app/dashboard/dashboard.css`, everything
  under `.epd`): nothing leaks into the home page or the vision dashboard.
  Light + dark, reduced-motion, focus-visible, and a colour-vision-deficiency
  validated provider palette (colour follows the provider, never rank).
- **Client validation mirrors, never replaces, server validation.** The zod
  schemas in `src/shared/types/*` and the benchmark DTOs stay authoritative
  server-side; the form does instant checks (uuid shape, prompt ≤ 10,000
  chars, iterations 1–100) matching those schemas.
- **Accessibility:** labelled fields with `aria-invalid`/error text, stepper
  with `aria-current` and focus management, `role="status"`/`role="alert"`
  live regions, table semantics, visible focus rings.

## Dependency requests to module owners (per team workflow — not rewritten here)

1. **workloads/devices persistence** (`POST /api/v1/workloads`, `/devices`
   currently echo `temp-*-id` and do not persist). The dashboard detects the
   placeholder ids, tells the user the row was NOT saved, and accepts an
   existing database UUID instead. Once the endpoints persist (and a GET list
   exists), delete that fallback path in `SetupPanel.tsx` — everything else
   already works.
2. **GET list endpoints** for workloads/devices would replace the manual UUID
   field with a picker.
3. A `user_id`-less benchmark history needs sessions; until then the
   dashboard does not render a history list (see `GET /api/v1/benchmarks`
   empty-list rationale).

## Testing

`tests/dashboard/format.test.ts` pins the null-honesty helpers (null is
"not measured", never 0; placeholder-id detection; error-code copy). Run with
`npm test`. UI flows were manually verified against the failure matrix in
`benchmark-api.md` (validation 400, unknown rows 404, all-providers-failed
with preserved run, database-unavailable 503, network-down).
