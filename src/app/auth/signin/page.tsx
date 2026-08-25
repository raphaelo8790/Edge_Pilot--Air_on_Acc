"use client";

/**
 * Sign-in Page
 * 
 * Provides GitHub OAuth sign-in for EdgePilot AI.
 * 
 * @module src/app/auth/signin/page
 */

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();

  const handleSignIn = async () => {
    await signIn("github", { callbackUrl: "/dashboard" });
  };

  return (
    <div className="container">
      <header className="nav-bar">
        <div className="nav-logo pixel-border" style={{ padding: "var(--sp-1) var(--sp-3)" }}>
          EDGEPILOT_AI
        </div>
        <nav className="nav-links">
          <a href="/">HOME</a>
          <a href="/dashboard">BENCHMARK</a>
          <a href="/vision-benchmark">VISION</a>
        </nav>
      </header>

      <div className="card" style={{ maxWidth: "400px", margin: "0 auto", padding: "var(--sp-6)" }}>
        <h2 style={{ textAlign: "center", marginBottom: "var(--sp-4)" }}>
          SIGN IN
        </h2>
        <p style={{ color: "var(--text-secondary)", textAlign: "center", marginBottom: "var(--sp-4)" }}>
          Sign in with your GitHub account to access EdgePilot AI.
        </p>
        <button
          onClick={handleSignIn}
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
        >
          SIGN IN WITH GITHUB
        </button>
        <p style={{ color: "var(--text-secondary)", textAlign: "center", marginTop: "var(--sp-4)", fontSize: "0.8rem" }}>
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
