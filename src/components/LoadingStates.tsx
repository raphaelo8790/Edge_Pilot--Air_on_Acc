"use client";

/**
 * Loading States Components
 * 
 * Various loading state components for different UI contexts.
 * 
 * @module src/components/LoadingStates
 */

/**
 * Button Loading State
 */
export function ButtonLoading({ children, isLoading }: { children: React.ReactNode; isLoading: boolean }) {
  if (!isLoading) return <>{children}</>;
  
  return (
    <>
      <span className="spinner" style={{ width: "16px", height: "16px" }} />
      {children}
    </>
  );
}

/**
 * Card Loading Skeleton
 */
export function CardSkeleton() {
  return (
    <div className="card" style={{ opacity: 0.7 }}>
      <div style={{ 
        height: "20px", 
        background: "var(--bg-surface-lighter)", 
        marginBottom: "var(--sp-2)",
        width: "60%",
      }} />
      <div style={{ 
        height: "16px", 
        background: "var(--bg-surface-lighter)", 
        marginBottom: "var(--sp-1)",
        width: "80%",
      }} />
      <div style={{ 
        height: "16px", 
        background: "var(--bg-surface-lighter)", 
        width: "40%",
      }} />
    </div>
  );
}

/**
 * Table Loading Skeleton
 */
export function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card">
      <div style={{ 
        height: "20px", 
        background: "var(--bg-surface-lighter)", 
        marginBottom: "var(--sp-3)",
        width: "30%",
      }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: "var(--sp-2)",
            marginBottom: "var(--sp-2)",
          }}
        >
          <div style={{ 
            height: "16px", 
            background: "var(--bg-surface-lighter)", 
            flex: 1,
          }} />
          <div style={{ 
            height: "16px", 
            background: "var(--bg-surface-lighter)", 
            flex: 2,
          }} />
          <div style={{ 
            height: "16px", 
            background: "var(--bg-surface-lighter)", 
            flex: 1,
          }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Progress Loading
 */
export function ProgressLoading({ progress }: { progress: number }) {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        marginBottom: "var(--sp-1)" 
      }}>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
          Progress
        </span>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
          {Math.round(progress)}%
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}
