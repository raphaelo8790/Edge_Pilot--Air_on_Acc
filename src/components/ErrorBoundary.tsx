"use client";

/**
 * Error Boundary Component
 * 
 * Catches React errors and displays fallback UI.
 * Prevents entire app from crashing.
 * 
 * @module src/components/ErrorBoundary
 */

import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: "var(--sp-4)",
            textAlign: "center",
            background: "var(--bg-surface)",
            border: "2px solid var(--color-error)",
            margin: "var(--sp-4)",
          }}
        >
          <h2 style={{ color: "var(--color-error)", marginBottom: "var(--sp-2)" }}>
            Something went wrong
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--sp-4)" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
