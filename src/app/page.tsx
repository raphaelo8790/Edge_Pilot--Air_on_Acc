export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">EdgePilot AI</h1>
      <p className="text-xl text-gray-600 mb-8">
        Compare local and cloud AI deployment — with real benchmarks, not guesses.
      </p>
      <div className="flex gap-4">
        <a
          href="/dashboard"
          className="bg-slate-800 hover:bg-slate-950 text-white font-bold py-2 px-4 rounded"
        >
          Benchmark Dashboard
        </a>
        <a
          href="/vision-benchmark"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Vision Dashboard
        </a>
        <a
          href="/evidence"
          className="bg-amber-500 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded"
        >
          Evidence
        </a>
        <a
          href="/api/v1/vision-benchmarks"
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          Evidence API
        </a>
      </div>
    </main>
  );
}
