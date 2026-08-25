import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="ep-grid-bg flex min-h-dvh flex-col items-center justify-center bg-ink-950 px-6 text-center">
      <p className="ep-label">error · route_not_found</p>
      <h1 className="mt-5 font-display text-6xl font-semibold tracking-tight text-mist-100">
        404
      </h1>
      <p className="mt-4 max-w-md leading-relaxed text-mist-400">
        This page does not exist. Like any unmeasured claim, it should not be
        trusted.
      </p>
      <div className="mt-9 flex gap-4">
        <Link
          href="/"
          className="rounded-lg bg-pulse-500 px-5 py-2.5 font-semibold text-pulse-ink transition hover:bg-pulse-400 active:translate-y-px"
        >
          Back to home
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-ink-600 px-5 py-2.5 font-semibold text-mist-300 transition hover:border-pulse-500 hover:text-mist-100"
        >
          Open the dashboard
        </Link>
      </div>
    </main>
  );
}
