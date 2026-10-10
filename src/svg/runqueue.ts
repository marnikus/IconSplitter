// runqueue.ts — the generation queue (I-53). Why it exists: the user must be
// able to keep adding work while a request is in flight. A confirmed batch is
// APPENDED here and never interrupts the run in progress; when that run ends the
// head starts automatically. The rules are pure so they can be proven on their
// own: appending never displaces what waits, only the head may start, a drop by
// id leaves the rest untouched, and the drain decision is "nothing in flight".
//
// The queue is session-only on purpose: a queued batch was never sent, and the
// in-flight journal's promise is to resend nothing without the user, so
// restoring a queue from storage would send work on boot. Nothing here writes.

import type { RegenPlan } from "../lib/svgregen";

export interface QueueItem {
  /** Session-only id, stable while the batch waits (a drop names it). */
  id: string;
  /** The approved sources this batch will send, in the order they were picked. */
  ids: string[];
  /** How many sources it carries. */
  count: number;
  /** How many requests they become at the user's configured size (RULE 10). */
  requests: number;
  /** What it is, for the waiting list: the first source plus "+ N more". */
  label: string;
  /** Regeneration plan for this batch: null = first generation (main prompt). */
  regen: RegenPlan | null;
}

let seq = 0;

/** One confirmed batch, ready to wait its turn. */
export function queueItem(
  ids: readonly string[],
  requests: number,
  label: string,
  regen: RegenPlan | null = null,
): QueueItem {
  seq += 1;
  return { id: `q${seq}`, ids: [...ids], count: ids.length, requests: Math.max(1, requests), label, regen };
}

/** Appends: new work never interrupts or displaces what is already waiting. */
export function enqueue(queue: readonly QueueItem[], item: QueueItem): QueueItem[] {
  return [...queue, item];
}

/** The NEXT attempt (2026-10-08): a Regenerate goes first; what waited still waits, in order. */
export function enqueueFront(queue: readonly QueueItem[], item: QueueItem): QueueItem[] {
  return [item, ...queue];
}

/** What a shrunk batch is re-planned to: the caller's request arithmetic and its label. */
export type Replan = (ids: readonly string[]) => { requests: number; label: string };

/**
 * One queue never generates the same image twice: the source leaves every
 * batch that still waits for it (a batch left empty goes), and the survivors
 * are re-planned — requests AND label — through the caller.
 */
export function dropIdFrom(
  queue: readonly QueueItem[], id: string, replan: Replan,
): { queue: QueueItem[]; removedFrom: number } {
  const touched = queue.filter((item) => item.ids.includes(id));
  const next = queue
    .map((item) => (item.ids.includes(id) ? shrink(item, id, replan) : item))
    .filter((item) => item.count > 0);
  return { queue: next, removedFrom: touched.length };
}

function shrink(item: QueueItem, id: string, replan: Replan): QueueItem {
  const ids = item.ids.filter((x) => x !== id);
  if (ids.length === 0) return { ...item, ids, count: 0 };
  const planned = replan(ids);
  return { ...item, ids, count: ids.length, requests: Math.max(1, planned.requests), label: planned.label };
}

/** Every source that waits in some batch — the rows' "next attempt" flag reads it. */
export function queuedIds(queue: readonly QueueItem[]): Set<string> {
  return new Set(queue.flatMap((item) => item.ids));
}

/** The head (the batch that may start) and the rest, in one step. */
export function shiftQueue(queue: readonly QueueItem[]): { head: QueueItem | null; rest: QueueItem[] } {
  return { head: queue[0] ?? null, rest: queue.slice(1) };
}

/** Removes one queued batch by id; an unknown id changes nothing. */
export function dropQueued(queue: readonly QueueItem[], id: string): QueueItem[] {
  return queue.filter((item) => item.id !== id);
}

/** Empties the queue and reports how many batches that was (cancel says it). */
export function dropAll(queue: readonly QueueItem[]): { rest: QueueItem[]; dropped: number } {
  return { rest: [], dropped: queue.length };
}

/** The drain decision: the head starts only when nothing is in flight. */
export function nextRun(queue: readonly QueueItem[], running: boolean): QueueItem | null {
  return running ? null : queue[0] ?? null;
}

/** Batches waiting, for the strip's line and its count. */
export function queuedCount(queue: readonly QueueItem[]): number {
  return queue.length;
}
