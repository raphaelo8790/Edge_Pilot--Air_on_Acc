"use client";

/**
 * Shared async-state views for the dashboard: loading, error (with retry and
 * the server's own error/details verbatim), and empty. Acceptance criteria
 * require idle/loading/success/validation/unavailable/failure/empty/retry
 * states to be visible — these are the reusable pieces behind them.
 */
import type { ApiFailure } from "./api";

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="state-title">Working…</p>
      <p className="state-detail">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  onAction,
  actionLabel,
}: {
  title: string;
  detail: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="state-panel" role="status">
      <p className="state-title">{title}</p>
      <p className="state-detail">{detail}</p>
      {onAction ? (
        <button className="btn" onClick={onAction}>
          {actionLabel ?? "Reload"}
        </button>
      ) : null}
    </div>
  );
}

function detailText(details: unknown): string | null {
  if (!details) return null;
  if (typeof details === "string") return details;
  if (Array.isArray(details)) {
    // zod issue array from the server — show path + message, verbatim enough
    return details
      .map((issue) => {
        const record = issue as { path?: unknown[]; message?: string };
        const path = Array.isArray(record.path) ? record.path.join(".") : "";
        return path ? `${path}: ${record.message ?? ""}` : (record.message ?? "");
      })
      .filter(Boolean)
      .join(" · ");
  }
  return JSON.stringify(details);
}

export function ErrorState({
  failure,
  onRetry,
}: {
  failure: ApiFailure;
  onRetry?: () => void;
}) {
  const detail = detailText(failure.details);
  return (
    <div className="state-panel state-error" role="alert">
      <p className="state-title">
        {failure.error}
        {failure.status > 0 ? ` (HTTP ${failure.status})` : ""}
      </p>
      {detail ? <p className="state-detail">{detail}</p> : null}
      {onRetry ? (
        <button className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
