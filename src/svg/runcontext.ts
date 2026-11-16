// runcontext.ts — what the queue's async paths all touch (2026-10-20). It sits
// below runcontrol and runqueuepath so both can write the ONE queue without
// importing each other: the ref is the authority, the mirror is for rendering.

import type { SvgAction } from "./statemodel";
import type { SvgRefs } from "./types";
import type { QueueItem } from "./runqueue";
import type { SvgCtx } from "./actions";
import type { RunSetters } from "./runstate";

/**
 * Only what the queue's async paths touch — a structural subset of SvgCtx, so
 * the panel's context satisfies it unchanged and a test can build one on its own.
 */
export interface RunCtx extends RunSetters {
  m: SvgCtx["m"];
  refs: SvgRefs;
  dispatch: (action: SvgAction) => void;
  rows: SvgCtx["rows"];
  say: SvgCtx["say"];
}

/**
 * What a cancel did to the queue, carried on the run it stopped (I-53). The
 * run's own ending sentence is written AFTER the cancel toast, so the count
 * travels with the run or the user never learns what was dropped.
 */
export interface CancelNote {
  dropped: number;
}

/** One writer for the queue: the ref first (synchronously), then the mirror. */
export function setQueue(ctx: RunCtx, queue: QueueItem[]): void {
  ctx.refs.queue.current = queue;
  ctx.dispatch({ type: "queue", queue });
}
