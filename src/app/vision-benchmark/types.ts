import type { VisionBenchmarkEvidence } from '@/modules/vision-benchmark/core/types';

/**
 * Shared shape for the in-page vision run.
 *
 * It lives here rather than beside the action because a file marked
 * 'use server' may only export async functions — exporting an interface from
 * one is a build error, not a warning.
 */
export interface RunBuiltInResult {
  ok: boolean;
  /**
   * The complete evidence object when the run succeeded — the same shape the
   * CLI writes to disk. It is returned rather than saved so the caller can
   * keep it in the visitor's own browser; see components/vision/runHistory.ts.
   */
  evidence?: VisionBenchmarkEvidence;
  /** Present when not ok. Written for a human, never a stack trace. */
  error?: string;
}
