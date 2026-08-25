/** Route-level loading state for /dashboard (App Router convention). */
export default function Loading() {
  return (
    <main
      style={{
        maxWidth: 1060,
        margin: "0 auto",
        padding: "32px 24px",
      }}
      aria-busy="true"
    >
      <p role="status">Loading the benchmark dashboard…</p>
    </main>
  );
}
