// runtotals.ts — the ONE arithmetic behind "N done · M left" (2026-10-08).
// Why it exists: the run popup on every tab, the bulk bar and the log must say
// the same numbers, so they are computed once from the two facts that exist —
// the run's progress (finished requests + the request in flight) and the
// batches still waiting behind it. Pure; nothing here reads React or the DOM.

import type { BatchOutcome } from "../lib/svgbatch";
import type { QueueItem } from "./runqueue";
import type { RunProgress } from "./types";

export interface RunTotals {
  /** Images with a confirmed outcome in this run (saved, failed or missing). */
  done: number;
  /** Images still to come: the rest of this run plus every waiting batch. */
  left: number;
  /** Images that did not save (failed + missing) — what the user must look at. */
  failed: number;
  /** Images this run carries. */
  images: number;
  /** Images waiting in batches behind the run. */
  queued: number;
  /** The request in flight, 1-based, and how many the run has (0 when idle). */
  request: number;
  requests: number;
}

export function runTotals(progress: RunProgress | null, queue: readonly QueueItem[]): RunTotals {
  const queued = queue.reduce((n, item) => n + item.count, 0);
  if (progress === null) return { done: 0, left: queued, failed: 0, images: 0, queued, request: 0, requests: 0 };
  const finished = progress.outcomes.reduce((n, o) => n + o.saved + o.failed + o.missing, 0);
  const inFlight = isFinished(progress) ? 0 : progress.saved + progress.failed + progress.missing;
  const done = Math.min(progress.images, finished + inFlight);
  const failed = progress.outcomes.reduce((n, o) => n + o.failed + o.missing, 0)
    + (isFinished(progress) ? 0 : progress.failed + progress.missing);
  return { done, left: progress.images - done + queued, failed, images: progress.images, queued, request: progress.index, requests: progress.batches };
}

/** The request in flight already has its outcome line: do not count it twice. */
function isFinished(progress: RunProgress): boolean {
  return progress.outcomes.some((o) => o.id === progress.batchId);
}

/** "Generating · 7 done · 13 left · 1 failed · request 2 of 5" / "Done · 20 done · 0 left". */
export function totalsLine(t: RunTotals, running: boolean): string {
  const parts = [running ? "Generating" : "Done", `${t.done} done`, `${t.left} left`];
  if (t.failed > 0) parts.push(`${t.failed} failed`);
  if (running) parts.push(`request ${t.request} of ${t.requests}`);
  return parts.join(" · ");
}

/**
 * One chain of runs is ONE count. A queued batch starts as its own run, but
 * the user queued it behind the last one and reads "N done · M left" across
 * the whole chain. `Chain` is what the runs BEFORE the one on screen did; the
 * queue control folds a finished run in when the next one starts (from its
 * outcomes, the record of what was sent) and resets it when a run starts from
 * idle. Pure arithmetic; the model keeps the value.
 */
export interface Chain {
  done: number;
  failed: number;
}

export const NO_CHAIN: Chain = { done: 0, failed: 0 };

export function chainAdd(chain: Chain, outcomes: readonly BatchOutcome[]): Chain {
  const done = outcomes.reduce((n, o) => n + o.saved + o.failed + o.missing, 0);
  const failed = outcomes.reduce((n, o) => n + o.failed + o.missing, 0);
  return { done: chain.done + done, failed: chain.failed + failed };
}

/** The run on screen plus the chain before it — what the popup shows. */
export function withChain(t: RunTotals, chain: Chain): RunTotals {
  return { ...t, done: t.done + chain.done, failed: t.failed + chain.failed };
}
