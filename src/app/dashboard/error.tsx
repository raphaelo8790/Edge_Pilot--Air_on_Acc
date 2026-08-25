"use client";

/** Route-level error boundary for /dashboard (App Router convention). */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{ maxWidth: 640, margin: "10vh auto", padding: 24, textAlign: "center" }}
      role="alert"
    >
      <h1 style={{ fontSize: 20 }}>The dashboard hit an unexpected error</h1>
      <p style={{ color: "#666" }}>
        {error.digest ? `Reference: ${error.digest}. ` : ""}
        Your run data is not lost if it was persisted — try again.
      </p>
      <button
        onClick={() => reset()}
        style={{ padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}
      >
        Try again
      </button>
    </main>
  );
}
