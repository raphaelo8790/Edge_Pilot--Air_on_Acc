"use client";

/**
 * EdgePilot AI — Vision Benchmark Page
 * 
 * Computer vision benchmarking dashboard with retro/pixel aesthetic.
 * 
 * @module src/app/vision-benchmark/page
 */

import { useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function VisionBenchmarkPage() {
  return (
    <ErrorBoundary>
      <VisionBenchmarkContent />
    </ErrorBoundary>
  );
}

function VisionBenchmarkContent() {
  const router = useRouter();

  return (
    <div className="container">
      {/* Navigation */}
      <header className="nav-bar">
        <div className="nav-logo pixel-border" style={{ padding: 'var(--sp-1) var(--sp-3)' }}>
          EDGEPILOT_AI
        </div>
        <nav className="nav-links">
          <a href="/">HOME</a>
          <a href="/dashboard">BENCHMARK</a>
          <a href="/vision-benchmark" className="active">VISION</a>
        </nav>
      </header>

      {/* Content */}
      <section className="card text-center" style={{ padding: 'var(--sp-6)' }}>
        <h1 style={{ 
          fontSize: '2rem', 
          textTransform: 'uppercase', 
          letterSpacing: '2px' 
        }}>
          VISION <span className="text-accent glow-text">BENCHMARK</span>
        </h1>
        <p style={{ 
          color: 'var(--text-secondary)', 
          maxWidth: '600px', 
          margin: '0 auto var(--sp-4)' 
        }}>
          Computer vision benchmarking dashboard. Dataset viewer and performance metrics.
        </p>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" disabled>
            UPLOAD DATASET
          </button>
          <button className="btn btn-primary" disabled>
            RUN VISION TEST
          </button>
        </div>
        <div className="mt-4 text-secondary" style={{ 
          fontSize: '0.9rem', 
          border: '1px dashed var(--text-secondary)', 
          padding: 'var(--sp-4)' 
        }}>
          [ Vision Dataset Viewer / Results Placeholder ]
        </div>
      </section>
    </div>
  );
}
