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
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'edgepilot.vision-runs';
const BENCHMARK_KEY = 'edgepilot.benchmark-runs';
const COMPARISON_KEY = 'edgepilot.comparison-runs';

/**
 * Runs kept per browser. Each is roughly 8 KB, and the localStorage budget is
 * about 5 MB shared with everything else on the origin, so this is far below
 * any limit while still being a bounded number a person can actually read.
 */
export const MAX_STORED_RUNS = 20;

// ---------------------------------------------------------------------------
// A localStorage-backed list React can subscribe to
//
// WHY A STORE AND NOT "READ IT IN AN EFFECT". The server has no localStorage,
// so the first render must show an empty list and the real one must arrive
// only on the client. Doing that with `useEffect(() => setRuns(readRuns()))`
// renders twice and is flagged by the React Compiler lint rule
// (react-hooks/set-state-in-effect). `useSyncExternalStore` is the API React
// provides for exactly this shape: a value that lives outside React, with a
// server snapshot (empty) and a client snapshot (whatever is stored).
//
// SNAPSHOTS ARE CACHED. `useSyncExternalStore` compares snapshots by identity,
// so `getSnapshot` must return the same array until the data actually changes.
// The cache is keyed on the raw string in storage: unchanged string, same
// array. A change made in another tab therefore shows up on the next read.
// ---------------------------------------------------------------------------

interface Stored {
  storedAt: number;
}

const EMPTY: never[] = [];

function createStore<T extends Stored>(key: string, isEntry: (e: unknown) => e is T) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined; // undefined = never read
  let cachedValue: T[] = EMPTY;

  function parse(raw: string | null): T[] {
    if (!raw) return EMPTY;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return EMPTY;

      // Anything that does not look like a run is dropped rather than
      // rendered. Stored data outlives code, and a shape from an older version
      // must not take the page down.
      return parsed.filter(isEntry);
    } catch {
      return EMPTY;
    }
  }

  function rawNow(): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function read(): T[] {
    if (typeof window === 'undefined') return EMPTY;

    const raw = rawNow();
    if (cachedRaw === undefined || raw !== cachedRaw) {
      cachedRaw = raw;
      cachedValue = parse(raw);
    }
    return cachedValue;
  }

  function notify() {
    listeners.forEach((listener) => listener());
  }

  /** Newest first, capped. Returns the list as it now stands. */
  function add(entry: T): T[] {
    const next = [entry, ...read()].slice(0, MAX_STORED_RUNS);

    try {
      const raw = JSON.stringify(next);
      window.localStorage.setItem(key, raw);
      cachedRaw = raw;
    } catch {
      // Full, or blocked. The run still shows on screen for this visit; it
      // just will not survive a reload. Silently losing it is better than
      // throwing away a measurement that already cost real GPU time.
      // `cachedRaw` stays as what storage really holds, so `read()` keeps
      // returning this in-memory list until storage genuinely changes.
    }

    cachedValue = next;
    notify();
    return next;
  }

  function clear(): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* nothing to do - the caller re-reads and gets whatever is really there */
    }

    cachedRaw = rawNow();
    cachedValue = EMPTY;
    notify();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    // Another tab writing the same key fires `storage` here.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) listener();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }

  function getServerSnapshot(): T[] {
    return EMPTY;
  }

  function use(): T[] {
    return useSyncExternalStore(subscribe, read, getServerSnapshot);
  }

  return { read, add, clear, use };
}

function isStored(entry: unknown, field: string): boolean {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as Stored).storedAt === 'number' &&
    typeof (entry as Record<string, unknown>)[field] === 'object' &&
    (entry as Record<string, unknown>)[field] !== null
  );
}

// ---------------------------------------------------------------------------
// Vision runs
// ---------------------------------------------------------------------------

export interface StoredVisionRun {
  /** Milliseconds since epoch, stamped when it was stored. */
  storedAt: number;
  evidence: VisionBenchmarkEvidence;
}

const visionStore = createStore<StoredVisionRun>(
  STORAGE_KEY,
  (e): e is StoredVisionRun => isStored(e, 'evidence')
);

export const readRuns = visionStore.read;
export const clearRuns = visionStore.clear;
/** Subscribe a component to the list. Empty on the server and first paint. */
export const useStoredRuns = visionStore.use;

/** Newest first, capped. Returns the list as it now stands. */
export function addRun(evidence: VisionBenchmarkEvidence): StoredVisionRun[] {
  return visionStore.add({ storedAt: Date.now(), evidence });
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
  /**
   * Where the model was actually called from. 'browser' for an Ollama run
   * this tab made against the visitor's own machine; 'server' for a cloud
   * run. Absent on rows stored before the field existed, which were all
   * server runs.
   */
  measuredIn?: 'browser' | 'server';
}

const benchmarkStore = createStore<StoredBenchmarkRun>(
  BENCHMARK_KEY,
  (e): e is StoredBenchmarkRun => isStored(e, 'run')
);

export const readBenchmarkRuns = benchmarkStore.read;
export const clearBenchmarkRuns = benchmarkStore.clear;
export const useStoredBenchmarkRuns = benchmarkStore.use;

export function addBenchmarkRun(
  run: BenchmarkRun,
  measuredIn: 'browser' | 'server' = run.effective_provider === 'ollama' ? 'browser' : 'server'
): StoredBenchmarkRun[] {
  return benchmarkStore.add({ storedAt: Date.now(), run, measuredIn });
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

const comparisonStore = createStore<StoredComparisonRun>(
  COMPARISON_KEY,
  (e): e is StoredComparisonRun => isStored(e, 'comparison')
);

export const readComparisonRuns = comparisonStore.read;
export const clearComparisonRuns = comparisonStore.clear;
export const useStoredComparisonRuns = comparisonStore.use;

export function addComparisonRun(
  comparison: ComparisonResultDto
): StoredComparisonRun[] {
  return comparisonStore.add({ storedAt: Date.now(), comparison });
}
