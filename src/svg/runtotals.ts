// runtotals.ts — the one set of numbers the run popup and the bulk bar read
// (keep-alive plan D2). Why one function: the popup on another tab and the bar on
// this one must never disagree about "done" and "left". Pure: a progress snapshot
// and the waiting queue in, the counts out.
//
// What counts as DONE: an image whose result is settled — saved, failed or
// missing. An image of a request whose outcome is unknown, or that was cancelled
// before it was sent, stays LEFT: nothing about it is settled.

import type { QueueItem } from "./runqueue";
import type { RunProgress } from "./types";

export interface RunTotals {
  /** Images the run in flight carries. */
  images: number;
  /** Images with a settled result (saved, failed or missing). */
  done: number;
  /** Images not settled yet, plus every image in a waiting batch. */
  left: number;
  /** Images that failed (settled as failed). */
  failed: number;
  /** The request in flight (1-based), or the last one when the run ended. */
  request: number;
  /** The requests the run has. */
  requests: number;
}

interface Settled { settled: number; failed: number }

export function runTotals(progress: RunProgress | null, queue: readonly QueueItem[]): RunTotals {
  const waiting = queue.reduce((n, item) => n + item.count, 0);
  if (progress === null) return { images: 0, done: 0, left: waiting, failed: 0, request: 0, requests: 0 };
  const finished = progress.outcomes.reduce<Settled>(
    (acc, o) => ({ settled: acc.settled + o.saved + o.failed + o.missing, failed: acc.failed + o.failed }),
    { settled: 0, failed: 0 },
  );
  const live = liveSettled(progress);
  const done = finished.settled + live.settled;
  return {
    images: progress.images,
    done,
    left: Math.max(0, progress.images - done) + waiting,
    failed: finished.failed + live.failed,
    request: progress.index,
    requests: progress.batches,
  };
}

/**
 * The request in flight contributes its settled images until its batch-done has
 * landed; after that it is already in `outcomes`, so it must not count twice.
 */
function liveSettled(progress: RunProgress): Settled {
  const last = progress.outcomes.at(-1);
  if (last !== undefined && last.index === progress.index) return { settled: 0, failed: 0 };
  return { settled: progress.saved + progress.failed + progress.missing, failed: progress.failed };
}
