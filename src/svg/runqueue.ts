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
}

let seq = 0;

/** One confirmed batch, ready to wait its turn. */
export function queueItem(ids: readonly string[], requests: number, label: string): QueueItem {
  seq += 1;
  return { id: `q${seq}`, ids: [...ids], count: ids.length, requests: Math.max(1, requests), label };
}

/** Appends: new work never interrupts or displaces what is already waiting. */
export function enqueue(queue: readonly QueueItem[], item: QueueItem): QueueItem[] {
  return [...queue, item];
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

/** Where a confirmed batch goes: behind the queue, or first (a Regenerate). */
export type Placement = "front" | "back";

/** A batch that goes FIRST: it starts the moment the run in flight ends. */
export function enqueueFront(queue: readonly QueueItem[], item: QueueItem): QueueItem[] {
  return [item, ...queue];
}

/** One confirmed batch, placed where its placement says. */
export function placeItem(queue: readonly QueueItem[], item: QueueItem, placement: Placement): QueueItem[] {
  return placement === "front" ? enqueueFront(queue, item) : enqueue(queue, item);
}

/** How a waiting batch is described again once a source has left it. */
export interface Resize {
  requests: number;
  label: string;
}

/**
 * Takes one source out of EVERY waiting batch that carries it (D4, Q2): an image
 * is never generated twice by one queue. A batch the removal empties is dropped;
 * a batch that keeps others keeps its id and position and is described again.
 */
export function dropIdFrom(
  queue: readonly QueueItem[], sourceId: string, resize: (ids: string[]) => Resize,
): { queue: QueueItem[]; touched: number } {
  let touched = 0;
  const next: QueueItem[] = [];
  for (const item of queue) {
    if (!item.ids.includes(sourceId)) {
      next.push(item);
      continue;
    }
    touched += 1;
    const ids = item.ids.filter((id) => id !== sourceId);
    if (ids.length > 0) next.push(withIds(item, ids, resize(ids)));
  }
  return { queue: next, touched };
}

function withIds(item: QueueItem, ids: string[], size: Resize): QueueItem {
  return { ...item, ids, count: ids.length, requests: Math.max(1, size.requests), label: size.label };
}

/** Every source a waiting batch carries: what the list shows as "Next attempt". */
export function queuedIds(queue: readonly QueueItem[]): Set<string> {
  return new Set(queue.flatMap((item) => item.ids));
}
