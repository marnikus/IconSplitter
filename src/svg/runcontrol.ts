// runcontrol.ts — the queue's async half (I-53). Why it is separate from
// runqueue.ts: the rules there are pure and provable on their own, while this
// module owns the ONE run in flight at a time and the waiting work behind it.
// Its guarantees:
//   * confirming a batch never interrupts a run — it is appended and waits;
//   * the head of the queue starts by itself when the run before it ends;
//   * the ref is the authority (`refs.queue`, and a run in flight is
//     `refs.abort.current !== null`), so a stale closure can never start two
//     runs at once or lose a batch that was added mid-run;
//   * a batch that waits changes nothing about the files until its request
//     really starts — the row only SAYS it is next (`queued`, 2026-10-08);
//   * a row's Regenerate while a run is in flight is the NEXT attempt: first in
//     the queue, no dialog, and the same image leaves every later batch so one
//     queue never generates it twice.
// 2026-10-09: regeneration prompt is per-batch, chosen in popup.

import type { DirHandleLike } from "../lib/fs";
import { log } from "../log/logstore";
import type { SvgAction } from "./statemodel";
import { planOf } from "./runplan";
import { resolveRegen } from "./regenstore";
import { MAIN_PLAN, regenLabelOf, regenPlanFromPresetName, type RegenPlan } from "../lib/svgregen";
import { inIdOrder } from "../lib/selectionorder";
import { runGeneration } from "./runner";
import { withRunLog } from "./runlog";
import {
  dropAll, dropIdFrom, dropQueued as removeQueued, enqueue, enqueueFront, nextRun, queuedCount, queueItem, shiftQueue,
  type QueueItem,
} from "./runqueue";
import { onRunEvent, reloadSidecars, summaryLine, type RunSetters } from "./runstate";
import { chainAdd, NO_CHAIN, type Chain } from "./runtotals";
import type { BatchOutcome } from "../lib/svgbatch";
import type { Placement, SvgRefs } from "./types";
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

/** What queueing did: how many batches wait now, and how many later batches lost the image (front only). */
export interface Queued {
  waiting: number;
  removedFrom: number;
}

/** Queues one confirmed batch — behind what waits, or first (a row's next attempt). */
export function enqueueBatch(
  ctx: RunCtx,
  ids: string[],
  placement: Placement = "back",
  regen: RegenPlan | null = null,
): Queued {
  const item = queueItem(ids, requestsOf(ctx, ids, regen), labelOf(ctx, ids), regen);
  const { queue: base, removedFrom } = placement === "front" ? withoutIds(ctx, ids) : { queue: ctx.refs.queue.current, removedFrom: 0 };
  const queue = placement === "front" ? enqueueFront(base, item) : enqueue(base, item);
  setQueue(ctx, queue);
  log({
    feature: "svg", action: "batch-queued",
    detail: `${ids.length} source(s) → ${item.requests} request(s)${regen ? ` · ${regenLabelOf(regen)}` : ""}${placement === "front" ? " · first in the queue" : ""}`,
    data: { sources: ids.length, requests: item.requests, waiting: queuedCount(queue), placement, removedFrom },
  });
  return { waiting: queuedCount(queue), removedFrom };
}

/** The images leave every batch that still waits for them (one queue, one attempt each). */
function withoutIds(ctx: RunCtx, ids: string[]): { queue: QueueItem[]; removedFrom: number } {
  let queue = ctx.refs.queue.current;
  let removedFrom = 0;
  for (const id of ids) {
    const dropped = dropIdFrom(queue, id, (rest) => ({ requests: requestsOf(ctx, [...rest], null), label: labelOf(ctx, [...rest]) }));
    queue = dropped.queue;
    removedFrom += dropped.removedFrom;
  }
  return { queue, removedFrom };
}

/**
 * A row's Regenerate while a run is in flight (2026-10-08): the NEXT attempt.
 * No dialog — the queue line and the grey badge are visible before it starts;
 * the run in flight is never touched.
 */
export function regenerateNext(ctx: RunCtx, ids: string[]): void {
  // For front placement (no dialog), use global regen as fallback
  const regen = resolveCurrentRegen(ctx);
  const { waiting, removedFrom } = enqueueBatch(ctx, ids, "front", regen);
  const tail = removedFrom === 0 ? "" : ` · removed from ${removedFrom} waiting batch${removedFrom === 1 ? "" : "es"}`;
  ctx.say(`${labelOf(ctx, ids)} — next attempt, first in the queue (${waiting} queued)${tail}`);
}

function resolveCurrentRegen(ctx: RunCtx): RegenPlan | null {
  const stored = resolveRegen();
  if (stored.ok && stored.plan.kind !== "main") return stored.plan;
  // If no stored regen or main, fallback to first preset if exists
  const presets = ctx.m.presets;
  if (presets.length === 0) return null;
  const res = regenPlanFromPresetName(presets[0].name, presets);
  return res.ok ? res.plan : null;
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
 * 2026-10-09: regenPresetName null = first generation (main prompt), string = regeneration prompt.
 */
export async function confirmRun(ctx: RunCtx, regenPresetName: string | null): Promise<void> {
  const dialog = ctx.m.dialog;
  if (dialog === null || dialog.kind !== "confirm") return;
  const ids = dialog.ids;
  const operation = dialog.operation;
  let regen: RegenPlan | null = null;
  if (operation === "regenerate" && regenPresetName !== null) {
    const res = regenPlanFromPresetName(regenPresetName, ctx.m.presets);
    if (!res.ok) {
      ctx.say(res.problem, true);
      return;
    }
    regen = res.plan;
  } else if (operation === "generate") {
    regen = null;
  } else if (operation === "regenerate" && regenPresetName === null) {
    // Should not happen — regeneration must have a preset, but fallback to stored
    regen = resolveCurrentRegen(ctx);
  }
  ctx.dispatch({ type: "dialog", dialog: null });
  const { waiting } = enqueueBatch(ctx, ids, "back", regen);
  if (nextRun(ctx.refs.queue.current, busy(ctx)) === null) {
    log({ feature: "svg", action: "batch-waiting", detail: `${waiting} batch(es) waiting`, data: { waiting } });
    return ctx.say(`${ids.length} image(s) added — they wait for the run in flight (${waiting} queued)`);
  }
  await drainQueue(ctx);
}

/**
 * Runs the head of the queue, then the next, until nothing is waiting. The
 * chain count (popup, 2026-10-08) starts over with the first run and folds
 * each finished run in when the next one starts — the run on screen is never
 * counted twice, and the last one stays on screen with the chain before it.
 */
async function drainQueue(ctx: RunCtx): Promise<void> {
  let head = nextRun(ctx.refs.queue.current, busy(ctx));
  let chain: Chain | null = null;
  while (head !== null) {
    setQueue(ctx, shiftQueue(ctx.refs.queue.current).rest);
    ctx.dispatch({ type: "chain", chain: chain ?? NO_CHAIN });
    const outcomes = await startRun(ctx, head);
    chain = chainAdd(chain ?? NO_CHAIN, outcomes);
    head = nextRun(ctx.refs.queue.current, busy(ctx));
  }
}

/** One batch leaves for the provider: exactly the path a first run always took. Returns its per-request record. */
async function startRun(ctx: RunCtx, item: QueueItem): Promise<BatchOutcome[]> {
  const ids = item.ids;
  const regen = item.regen ?? MAIN_PLAN;
  log({ feature: "svg", action: "generate-confirmed", detail: `${ids.length} source(s) · ${regenLabelOf(regen)}`, data: { sources: ids.length } });
  const controller = beginRun(ctx, ids);
  const sources = inIdOrder(ctx.rows, ids, (r) => r.source.id).map((r) => r.source);
  const summary = await runGeneration({
    root: ctx.refs.root.current as DirHandleLike,
    apiKey: ctx.refs.key.current ?? "",
    config: ctx.m.config, caps: ctx.m.caps, params: ctx.m.params, prompt: ctx.m.prompt, regen, sources,
    metas: ctx.refs.metas, signal: controller.signal,
    onEvent: withRunLog((event) => onRunEvent(event, ctx)),
  });
  ctx.dispatch({ type: "running", running: false });
  ctx.refs.abort.current = null;
  await reloadSidecars(ctx.refs, sources, ctx);
  ctx.say(endLine(summary, controller.signal.reason), summary.saved === 0 && summary.problems.length > 0);
  return summary.outcomes;
}

/** Marks the selection as generating and returns the controller that cancels it. */
function beginRun(ctx: RunCtx, ids: string[]): AbortController {
  const controller = new AbortController();
  ctx.refs.abort.current = controller;
  ctx.dispatch({ type: "running", running: true });
  ctx.setRowsFn((rows) => rows.map((r) => (ids.includes(r.source.id) ? { ...r, status: "generating", running: true, error: null } : r)));
  return controller;
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
function requestsOf(ctx: RunCtx, ids: string[], regen: RegenPlan | null): number {
  return Math.max(1, planOf(ctx, ids, regen).length);
}
