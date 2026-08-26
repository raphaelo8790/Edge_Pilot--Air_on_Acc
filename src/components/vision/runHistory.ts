/**
 * A visitor's own benchmark runs, kept in their browser.
 *
 * WHY NOT ON THE SERVER. Runs made from the page are the visitor's, not the
 * project's. Writing them into `evidence/vision-benchmark/` mixed them in with
 * the reference measurements that ship in the repository, meant every visitor
 * saw every other visitor's runs, and grew the server's disk without bound. On
 * a serverless host it was worse than that: the filesystem is wiped between
 * requests, so runs would have vanished with no error.
 *
 * So the server runs the benchmark and returns the result; nothing is written
 * there. This module is where it lands instead.
 *
 * EVERY ACCESS IS GUARDED. localStorage throws outright in some privacy modes
 * rather than returning null, and a benchmark page that crashes because
 * someone browses privately would be a poor trade for a convenience feature.
 */

import type { VisionBenchmarkEvidence } from '@/modules/vision-benchmark/core/types';
import type {
  BenchmarkRun,
  ComparisonResultDto,
} from '@/components/dashboard/api';

const STORAGE_KEY = 'edgepilot.vision-runs';
const BENCHMARK_KEY = 'edgepilot.benchmark-runs';
const COMPARISON_KEY = 'edgepilot.comparison-runs';

/**
 * Runs kept per browser. Each is roughly 8 KB, and the localStorage budget is
 * about 5 MB shared with everything else on the origin, so this is far below
 * any limit while still being a bounded number a person can actually read.
 */
export const MAX_STORED_RUNS = 20;

export interface StoredVisionRun {
  /** Milliseconds since epoch, stamped when it was stored. */
  storedAt: number;
  evidence: VisionBenchmarkEvidence;
}

export function readRuns(): StoredVisionRun[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Anything that does not look like a run is dropped rather than rendered.
    // Stored data outlives code, and a shape from an older version must not
    // take the page down.
    return parsed.filter(
      (entry): entry is StoredVisionRun =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as StoredVisionRun).storedAt === 'number' &&
        typeof (entry as StoredVisionRun).evidence === 'object' &&
        (entry as StoredVisionRun).evidence !== null
    );
  } catch {
    return [];
  }
}

/** Newest first, capped. Returns the list as it now stands. */
export function addRun(evidence: VisionBenchmarkEvidence): StoredVisionRun[] {
  const next = [{ storedAt: Date.now(), evidence }, ...readRuns()].slice(
    0,
    MAX_STORED_RUNS
  );

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Full, or blocked. The run still shows on screen for this visit; it just
    // will not survive a reload. Silently losing it is better than throwing
    // away a measurement that already cost real GPU time.
  }

  return next;
}

export function clearRuns(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do - the caller re-reads and gets whatever is really there */
  }
}

// ---------------------------------------------------------------------------
// Text and code benchmark runs
//
// Same rules, separate key. The dashboard produced these and then dropped them
// the moment you navigated away — the run existed, cost real GPU time, and
// left no trace anywhere the visitor could get at it.
// ---------------------------------------------------------------------------

export interface StoredBenchmarkRun {
  storedAt: number;
  run: BenchmarkRun;
}

export function readBenchmarkRuns(): StoredBenchmarkRun[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(BENCHMARK_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is StoredBenchmarkRun =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as StoredBenchmarkRun).storedAt === 'number' &&
        typeof (entry as StoredBenchmarkRun).run === 'object' &&
        (entry as StoredBenchmarkRun).run !== null
    );
  } catch {
    return [];
  }
}

export function addBenchmarkRun(run: BenchmarkRun): StoredBenchmarkRun[] {
  const next = [{ storedAt: Date.now(), run }, ...readBenchmarkRuns()].slice(
    0,
    MAX_STORED_RUNS
  );

  try {
    window.localStorage.setItem(BENCHMARK_KEY, JSON.stringify(next));
  } catch {
    /* full or blocked - the run still shows on screen for this visit */
  }

  return next;
}

export function clearBenchmarkRuns(): void {
  try {
    window.localStorage.removeItem(BENCHMARK_KEY);
  } catch {
    /* nothing to do */
  }
}

// ---------------------------------------------------------------------------
// Comparisons
//
// The most expensive thing this application does — up to four entrants times
// (iterations + 1) real generations — and it was the one result that survived
// nowhere. Same rules as the other two.
// ---------------------------------------------------------------------------

export interface StoredComparisonRun {
  storedAt: number;
  comparison: ComparisonResultDto;
}

export function readComparisonRuns(): StoredComparisonRun[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(COMPARISON_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is StoredComparisonRun =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as StoredComparisonRun).storedAt === 'number' &&
        typeof (entry as StoredComparisonRun).comparison === 'object' &&
        (entry as StoredComparisonRun).comparison !== null
    );
  } catch {
    return [];
  }
}

export function addComparisonRun(
  comparison: ComparisonResultDto
): StoredComparisonRun[] {
  const next = [
    { storedAt: Date.now(), comparison },
    ...readComparisonRuns(),
  ].slice(0, MAX_STORED_RUNS);

  try {
    window.localStorage.setItem(COMPARISON_KEY, JSON.stringify(next));
  } catch {
    /* full or blocked - it still shows on screen for this visit */
  }

  return next;
}

export function clearComparisonRuns(): void {
  try {
    window.localStorage.removeItem(COMPARISON_KEY);
  } catch {
    /* nothing to do */
  }
}
