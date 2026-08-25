/*
  Adds `warmup` to benchmark_results.

  Every run now makes one more call than the caller asked for. The first is
  discarded from all averages because on a local runtime it pays for loading
  the model into GPU memory: an 8B model measured 36,445 ms to first token on
  a cold call and 369 ms on the next, from the same model and prompt on the
  same machine.

  The row is still stored, flagged, so a run read back from the database can
  say what its cold start cost without that figure contaminating anything.

  Additive and safe. The default means every row written before this column
  existed reads as a normal measured iteration, which is what it was.
*/

-- AlterTable
ALTER TABLE "benchmark_results" ADD COLUMN "warmup" BOOLEAN NOT NULL DEFAULT false;
