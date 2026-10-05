// runqueue.ts — the worker that drains the Generate SVG queue (2026-10-05).
// Owns: the awaiting list as the WORKER sees it (refs, so a run that is already
// in flight picks up new work without a re-render), the ONE drain loop that
// guarantees two requests are never in flight at once, and the ticket that
// names each confirmed batch.
//
// The render copy of the queue lives in the model (svg/statemodel): every
// change here is echoed there through `changed`, so the queue bar and the row
// badges show exactly what the worker will send (RULE 24). Nothing here is
// persisted: a reload never resends anything — restart truth stays the
// in-flight journal (I-20).

import { enqueue, nextQueued, removeQueued, type QueuedBatch } from "./queue";

/** The worker's own view of the queue: waiting batches + the drain flag. */
export interface QueueRefs {
  /** Batches confirmed and waiting; the batch in flight is NOT in here. */
  pending: { current: QueuedBatch[] };
  /** true from the first take until the last batch settles. */
  draining: { current: boolean };
}

/** Called with the waiting list every time it changes, for the render copy. */
export type QueueSink = (queue: readonly QueuedBatch[]) => void;

export function newQueueRefs(): QueueRefs {
  return { pending: { current: [] }, draining: { current: false } };
}

/** Adds a confirmed batch — appending is what makes Generate during a run safe. */
export function pushQueued(refs: QueueRefs, batch: QueuedBatch, changed: QueueSink): void {
  refs.pending.current = enqueue(refs.pending.current, batch);
  changed(refs.pending.current);
}

/** Drops one WAITING batch; the batch in flight is not in the list at all. */
export function dropQueued(refs: QueueRefs, id: string, changed: QueueSink): void {
  refs.pending.current = removeQueued(refs.pending.current, id);
  changed(refs.pending.current);
}

/** Forgets every waiting batch — what Cancel and "Clear queue" both do. */
export function clearQueued(refs: QueueRefs, changed: QueueSink): void {
  refs.pending.current = [];
  changed(refs.pending.current);
}

/** One ticket per confirmation, unique for the session. */
let tickets = 0;
export function nextTicket(): string {
  tickets += 1;
  return `q${tickets}`;
}

/**
 * Runs batches one at a time, oldest first, until nothing waits. A call made
 * while the loop is already running returns immediately: the loop in flight
 * takes the new batch after the current one settles. That is the whole trick
 * behind "Generate during a run appends instead of interrupting".
 */
export async function drainQueue(
  refs: QueueRefs, changed: QueueSink, run: (b: QueuedBatch) => Promise<void>,
): Promise<void> {
  if (refs.draining.current) return;
  refs.draining.current = true;
  try {
    for (let batch = takeHead(refs); batch !== null; batch = takeHead(refs)) {
      changed(refs.pending.current);
      await run(batch);
    }
  } finally {
    refs.draining.current = false;
    changed(refs.pending.current);
  }
}

/** Takes the oldest waiting batch out of the list, to hand to the runner. */
function takeHead(refs: QueueRefs): QueuedBatch | null {
  const head = nextQueued(refs.pending.current);
  if (head === null) return null;
  refs.pending.current = removeQueued(refs.pending.current, head.id);
  return head;
}
