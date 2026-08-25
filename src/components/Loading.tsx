"use client";

/**
 * Loading Component
 * 
 * Displays loading state with spinner and message.
 * 
 * @module src/components/Loading
 */

interface LoadingProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

export function Loading({ message = "Loading...", size = "md" }: LoadingProps) {
  const sizeMap = {
    sm: "12px",
    md: "16px",
    lg: "24px",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-4)",
      }}
    >
      <span
        className="spinner"
        style={{
          width: sizeMap[size],
          height: sizeMap[size],
        }}
      />
      <span style={{ color: "var(--text-secondary)" }}>{message}</span>
    </div>
  );
}

/**
 * Full Page Loading
 */
export function FullPageLoading({ message = "Loading..." }: { message?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-main)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <span className="spinner" style={{ width: "32px", height: "32px" }} />
        <p style={{ color: "var(--text-secondary)", marginTop: "var(--sp-3)" }}>
          {message}
        </p>
      </div>
    </div>
  );
}
