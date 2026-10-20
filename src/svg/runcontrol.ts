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
// 2026-10-20: the batch freezes its prompt choice, its per-request size and the
// current SVG code of every icon (I-76), so what the popup previewed is exactly
// what the queue sends — even if a preset is edited or deleted meanwhile.

import type { DirHandleLike } from "../lib/fs";
import { log } from "../log/logstore";
import { MAIN_PLAN, regenLabelOf, regenPlanFromPresetName, type RegenPlan } from "../lib/svgregen";
import { inIdOrder } from "../lib/selectionorder";
import { runGeneration } from "./runner";
import { withRunLog } from "./runlog";
import { dropAll, dropQueued as removeQueued, nextRun, queuedCount, shiftQueue, type QueueItem } from "./runqueue";
import { enqueueBatch } from "./runqueuepath";
import { setQueue } from "./runcontext";
import { onRunEvent, reloadSidecars, summaryLine } from "./runstate";
import { chainAdd, NO_CHAIN, type Chain } from "./runtotals";
import type { BatchOutcome } from "../lib/svgbatch";
import type { ConfirmedBatch } from "./types";
import type { CancelNote, RunCtx } from "./runcontext";

export type { CancelNote } from "./runcontext";
export type { ConfirmedBatch } from "./types";

/** Is a request in flight? The synchronous answer (never a stale state flag). */
export function busy(ctx: RunCtx): boolean {
  return ctx.refs.abort.current !== null;
}

/**
 * One confirmation = one queued batch. It starts now when nothing is in flight,
 * and simply waits (in confirmation order) when something is: the user's added
 * work is never dropped, and the run in flight is never interrupted.
 */
export async function confirmRun(ctx: RunCtx, confirmed: ConfirmedBatch): Promise<void> {
  const dialog = ctx.m.dialog;
  if (dialog === null || dialog.kind !== "confirm") return;
  const { ids, operation } = dialog;
  const regen = operation === "regenerate" ? regenOf(ctx, confirmed) : null;
  if (regen === "refused") return;
  ctx.dispatch({ type: "dialog", dialog: null });
  const { waiting } = enqueueBatch(ctx, { ids, placement: "back", regen, prompt: confirmed.choice, codes: confirmed.codes });
  if (nextRun(ctx.refs.queue.current, busy(ctx)) === null) {
    log({ feature: "svg", action: "batch-waiting", detail: `${waiting} batch(es) waiting`, data: { waiting } });
    return ctx.say(`${ids.length} image(s) added — they wait for the run in flight (${waiting} queued)`);
  }
  await drainQueue(ctx);
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

/**
 * The regeneration plan the popup confirmed, or the refusal that stops it. The
 * size comes from the popup (frozen in the plan), the preset from the choice —
 * a batch never falls back to the main prompt behind the user's back.
 */
function regenOf(ctx: RunCtx, confirmed: ConfirmedBatch): RegenPlan | null | "refused" {
  if (confirmed.choice.kind !== "preset") {
    ctx.say("Regeneration needs a saved prompt — pick one in the popup", true);
    return "refused";
  }
  const res = regenPlanFromPresetName(confirmed.choice.name, ctx.m.presets, confirmed.size);
  if (!res.ok) {
    ctx.say(res.problem, true);
    return "refused";
  }
  return res.plan;
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
    promptChoice: item.prompt, regenCodes: item.codes, metas: ctx.refs.metas, signal: controller.signal,
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
