"use client";

/**
 * EdgePilot AI — Home Page
 * 
 * Landing page with retro/pixel aesthetic.
 * Provides navigation to benchmark and vision dashboards.
 * 
 * @module src/app/page
 */

import { useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Home() {
  return (
    <ErrorBoundary>
      <HomeContent />
    </ErrorBoundary>
  );
}

function HomeContent() {
  const router = useRouter();

  return (
    <div className="container">
      {/* Navigation */}
      <header className="nav-bar">
        <div className="nav-logo pixel-border" style={{ padding: 'var(--sp-1) var(--sp-3)' }}>
          EDGEPILOT_AI
        </div>
        <nav className="nav-links">
          <a href="/" className="active">HOME</a>
          <a href="/dashboard">BENCHMARK</a>
          <a href="/vision-benchmark">VISION</a>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="card text-center" style={{ padding: 'var(--sp-6)' }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          textTransform: 'uppercase', 
          letterSpacing: '2px', 
          marginBottom: 'var(--sp-3)' 
        }}>
          Compare local & cloud AI<br />
          <span className="text-accent glow-text">with real benchmarks.</span>
        </h1>
        <p style={{ 
          color: 'var(--text-secondary)', 
          maxWidth: '600px', 
          margin: '0 auto var(--sp-4)', 
          fontSize: '1.1rem' 
        }}>
          EdgePilot AI helps teams compare local and cloud AI deployment options 
          with real benchmarks and evidence-based recommendations.
        </p>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary" 
            onClick={() => router.push('/dashboard')}
          >
            GET STARTED
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => router.push('/vision-benchmark')}
          >
            VISION BENCHMARK
          </button>
        </div>
      </section>

      {/* Features */}
      <div className="row">
        <div className="col card">
          <strong>Feature 01</strong><br />
          <span className="text-secondary">Real-world workload simulation</span>
        </div>
        <div className="col card">
          <strong>Feature 02</strong><br />
          <span className="text-secondary">Multi-provider comparison</span>
        </div>
        <div className="col card">
          <strong>Feature 03</strong><br />
          <span className="text-secondary">Evidence-based scoring</span>
        </div>
        <div className="col card">
          <strong>Feature 04</strong><br />
          <span className="text-secondary">Exportable JSON reports</span>
        </div>
      </div>
    </div>
  );
}
