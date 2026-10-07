// runcontrol.ts — the queue's async half (I-53). Why it is separate from
// runqueue.ts: the rules there are pure and provable on their own, while this
// module owns the ONE run in flight at a time and the waiting work behind it.
// Its guarantees:
//   * confirming a batch never interrupts a run — it is appended and waits;
//   * the head of the queue starts by itself when the run before it ends;
//   * the ref is the authority (`refs.queue`, and a run in flight is
//     `refs.abort.current !== null`), so a stale closure can never start two
//     runs at once or lose a batch that was added mid-run;
//   * a batch that waits is never a row status: nothing about the files
//     changes until its request really starts.

import type { DirHandleLike } from "../lib/fs";
import { log } from "../log/logstore";
import type { SvgAction } from "./statemodel";
import { planOf } from "./runplan";
import { inIdOrder } from "../lib/selectionorder";
import { runGeneration } from "./runner";
import { withRunLog } from "./runlog";
import {
  dropAll, dropQueued as removeQueued, enqueue, nextRun, queuedCount, queueItem, shiftQueue,
  type QueueItem,
} from "./runqueue";
import { onRunEvent, reloadSidecars, summaryLine, type RunSetters } from "./runstate";
import type { SvgRefs } from "./types";
import type { SvgCtx } from "./actions";

/**
 * Only what the queue's async paths touch — a structural subset of SvgCtx, so
 * the panel's context satisfies it unchanged and a test can build one on its
 * own. `RunSetters` is what the runner's events are written through.
 */
export interface RunCtx extends RunSetters {
  m: SvgCtx["m"];
  refs: SvgRefs;
  dispatch: (action: SvgAction) => void;
  rows: SvgCtx["rows"];
  say: SvgCtx["say"];
}

/**
 * What a cancel did to the queue, carried on the run it stopped. Why on the
 * abort: the run's own ending sentence is written AFTER the cancel toast, so if
 * the count were not travelling with the run it would be lost — the user would
 * see "0 saved · cancelled" with no word about the batches that were dropped.
 */
export interface CancelNote {
  dropped: number;
}

/** One writer for the queue: the ref first (synchronously), then the mirror. */
export function setQueue(ctx: RunCtx, queue: QueueItem[]): void {
  ctx.refs.queue.current = queue;
  ctx.dispatch({ type: "queue", queue });
}

/** Appends one confirmed batch and reports how many are waiting now. */
export function enqueueBatch(ctx: RunCtx, ids: string[]): number {
  const item = queueItem(ids, requestsOf(ctx, ids), labelOf(ctx, ids));
  const queue = enqueue(ctx.refs.queue.current, item);
  setQueue(ctx, queue);
  log({
    feature: "svg", action: "batch-queued",
    detail: `${ids.length} source(s) → ${item.requests} request(s)`,
    data: { sources: ids.length, requests: item.requests, waiting: queuedCount(queue) },
  });
  return queuedCount(queue);
}

/** Drops one batch that is still waiting; the run in flight is untouched. */
export function dropWaiting(ctx: RunCtx, itemId: string): number {
  const before = ctx.refs.queue.current;
  const rest = removeQueued(before, itemId);
  if (rest.length === before.length) return queuedCount(before);
  setQueue(ctx, rest);
  return queuedCount(rest);
}

/** A cancel empties the queue too, and says how many batches that dropped. */
export function dropQueueForCancel(ctx: RunCtx): number {
  const { rest, dropped } = dropAll(ctx.refs.queue.current);
  if (dropped > 0) setQueue(ctx, rest);
  return dropped;
}

/** Is a request in flight? The synchronous answer (never a stale state flag). */
export function busy(ctx: RunCtx): boolean {
  return ctx.refs.abort.current !== null;
}

/**
 * One confirmation = one queued batch. It starts now when nothing is in flight,
 * and simply waits (in confirmation order) when something is: the user's added
 * work is never dropped, and the run in flight is never interrupted.
 */
export async function confirmRun(ctx: RunCtx): Promise<void> {
  const dialog = ctx.m.dialog;
  if (dialog === null || dialog.kind !== "confirm") return;
  const ids = dialog.ids;
  ctx.dispatch({ type: "dialog", dialog: null });
  const waiting = enqueueBatch(ctx, ids);
  if (nextRun(ctx.refs.queue.current, busy(ctx)) === null) {
    log({ feature: "svg", action: "batch-waiting", detail: `${waiting} batch(es) waiting`, data: { waiting } });
    return ctx.say(`${ids.length} image(s) added — they wait for the run in flight (${waiting} queued)`);
  }
  await drainQueue(ctx);
}

/** Runs the head of the queue, then the next, until nothing is waiting. */
async function drainQueue(ctx: RunCtx): Promise<void> {
  let head = nextRun(ctx.refs.queue.current, busy(ctx));
  while (head !== null) {
    setQueue(ctx, shiftQueue(ctx.refs.queue.current).rest);
    await startRun(ctx, head);
    head = nextRun(ctx.refs.queue.current, busy(ctx));
  }
}

/** One batch leaves for the provider: exactly the path a first run always took. */
async function startRun(ctx: RunCtx, item: QueueItem): Promise<void> {
  const ids = item.ids;
  log({ feature: "svg", action: "generate-confirmed", detail: `${ids.length} source(s)`, data: { sources: ids.length } });
  const controller = new AbortController();
  ctx.refs.abort.current = controller;
  ctx.dispatch({ type: "running", running: true });
  ctx.setRowsFn((rows) => rows.map((r) => (ids.includes(r.source.id) ? { ...r, status: "generating", running: true, error: null } : r)));
  // The pick order, the same list the confirmation planned and previewed from:
  // the contact sheet this request carries is drawn cell by cell in it, so the
  // picture the user approved IS the picture that leaves (lib/selectionorder).
  const sources = inIdOrder(ctx.rows, ids, (r) => r.source.id).map((r) => r.source);
  const summary = await runGeneration({
    root: ctx.refs.root.current as DirHandleLike,
    apiKey: ctx.refs.key.current ?? "",
    config: ctx.m.config, caps: ctx.m.caps, params: ctx.m.params, prompt: ctx.m.prompt, sources,
    metas: ctx.refs.metas, signal: controller.signal,
    onEvent: withRunLog((event) => onRunEvent(event, ctx)),
  });
  ctx.dispatch({ type: "running", running: false });
  // The finished run stays visible: its per-request outcomes are the record of
  // what was sent, what it cost and what failed (the batch strip shows it).
  ctx.refs.abort.current = null;
  await reloadSidecars(ctx.refs, sources, ctx);
  ctx.say(endLine(summary, controller.signal.reason), summary.saved === 0 && summary.problems.length > 0);
}

/** The run's last word: its summary, plus what a cancel threw away (I-53). */
function endLine(summary: Parameters<typeof summaryLine>[0], reason: unknown): string {
  const dropped = (reason as CancelNote | null | undefined)?.dropped ?? 0;
  const line = summaryLine(summary);
  if (dropped === 0) return line;
  return `${line} · ${dropped} queued batch${dropped === 1 ? "" : "es"} dropped`;
}

/** "fog_AI.png + 3 more" — enough to recognise the batch while it waits. */
function labelOf(ctx: RunCtx, ids: string[]): string {
  const picked = inIdOrder(ctx.rows, ids, (r) => r.source.id);
  const first = picked[0]?.source.name ?? `${ids.length} source(s)`;
  const others = picked.length - 1;
  return others <= 0 ? first : `${first} + ${others} more`;
}

/**
 * The requests this selection becomes — the number the confirmation dialog
 * showed (RULE 10). Planned from the same splitter the runner uses, so a queued
 * line can say how many requests it really is.
 */
function requestsOf(ctx: RunCtx, ids: string[]): number {
  return Math.max(1, planOf(ctx, ids).length);
}
