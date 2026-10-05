// runactions.ts — what the user can make the Generate SVG tab DO: confirm a
// batch, watch the queue drain it, cancel, and drop waiting work (prompt §2/§3,
// RUN-2 2026-10-05). Extracted from actions.ts (RULE 18) so both files stay
// readable: everything here is about the run, everything there is about the
// tab's model, its sources and its selection.
//
// One confirmation = one queued batch; the drain loop takes the oldest waiting
// batch and never has two requests in flight. Confirming during a run APPENDS
// instead of interrupting it.

import { useCallback, useRef } from "react";
import { log } from "../log/logstore";
import { validateBatchPlan } from "../lib/svgbatch";
import type { DirHandleLike } from "../lib/fs";
import { onRunEvent, reloadSidecars, summaryLine } from "./runstate";
import { runGeneration } from "./runner";
import { withRunLog } from "./runlog";
import { guard, perRequestOf, planOf } from "./runplan";
import { clearQueued, drainQueue, dropQueued, nextTicket, pushQueued } from "./runqueue";
import { queuedBatch, type QueuedBatch, type QueuedRun } from "./queue";
import type { Dialog } from "./types";
import type { Slice, SvgCtx } from "./actions";

export function useRunActions(ctx: SvgCtx): Slice<
  "requestGenerate" | "cancelRun" | "confirmGenerate" | "dismissDialog" | "removeQueued" | "clearQueue"
> {
  const run = useRunControl(ctx);
  const queue = useQueueActions(ctx);
  return { ...run, ...queue };
}

function useRunControl(ctx: SvgCtx): Slice<"requestGenerate" | "cancelRun" | "confirmGenerate" | "dismissDialog"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const requestGenerate = useCallback((ids: string[]) => openConfirm(latest.current, ids), []);
  const cancelRun = useCallback(() => cancelEverything(latest.current), []);
  const confirmGenerate = useCallback(() => {
    void confirmRun(latest.current);
  }, []);
  const dismissDialog = useCallback(() => latest.current.dispatch({ type: "dialog", dialog: null }), []);
  return { requestGenerate, cancelRun, confirmGenerate, dismissDialog };
}

/** Opens the confirmation for the selection, or says why it cannot start. */
function openConfirm(c: SvgCtx, ids: string[]): void {
  const why = guard(c, ids);
  if (why !== null) return c.say(why, true);
  // The plan the user confirms is the plan the runner will send (RULE 10):
  // one splitter, one effective per-request size, validated before the dialog.
  const problems = validateBatchPlan(planOf(c, ids), perRequestOf(c));
  if (problems.length > 0) return c.say(problems[0], true);
  const dialog: Dialog = { kind: "confirm", ids };
  log({ feature: "svg", action: "confirm-opened", detail: `${ids.length} source(s)`, data: { sources: ids.length } });
  c.dispatch({ type: "dialog", dialog });
}

/** Cancels the flight and forgets the queue: "stop" must mean stop, both said. */
function cancelEverything(c: SvgCtx): void {
  log({ level: "warn", feature: "svg", action: "cancel-requested", detail: "the user asked to cancel — finished results are kept" });
  const dropped = clearQueueNow(c);
  c.refs.abort.current?.abort();
  c.say(dropped === 0
    ? "Cancelling — finished results are kept"
    : `Cancelling — finished results are kept, ${dropped} queued batch${dropped === 1 ? "" : "es"} dropped`);
}

/**
 * One confirmation = one QUEUED batch. Confirming while a run is in flight
 * appends instead of being ignored or interrupting it (RUN-2): the drain loop
 * takes whatever waits, oldest first, and never has two requests in flight.
 */
async function confirmRun(ctx: SvgCtx): Promise<void> {
  const dialog = ctx.m.dialog;
  if (dialog === null || dialog.kind !== "confirm") return;
  const ids = dialog.ids;
  log({ feature: "svg", action: "generate-confirmed", detail: `${ids.length} source(s)`, data: { sources: ids.length } });
  ctx.dispatch({ type: "dialog", dialog: null });
  const batch = queuedBatch(nextTicket(), frozenRunOf(ctx, ids), perRequestOf(ctx));
  pushQueued(ctx.refs.queue, batch, (queue) => ctx.setQueue([...queue]));
  await drainQueue(ctx.refs.queue, (queue) => ctx.setQueue([...queue]), (b) => runQueued(ctx, b));
}

/** The confirmed plan, frozen exactly as the confirmation showed it (RUN-1). */
function frozenRunOf(ctx: SvgCtx, ids: string[]): QueuedRun {
  return {
    sources: ctx.rows.filter((r) => ids.includes(r.source.id)).map((r) => r.source),
    config: ctx.m.config, caps: ctx.m.caps, params: ctx.m.params, prompt: ctx.m.prompt,
  };
}

/** Sends one queued batch; the caller (the drain loop) awaits it in turn. */
async function runQueued(ctx: SvgCtx, batch: QueuedBatch): Promise<void> {
  const run = batch.run;
  const ids = batch.sourceIds;
  const controller = new AbortController();
  ctx.refs.abort.current = controller;
  ctx.dispatch({ type: "running", running: true });
  ctx.setRowsFn((rows) => rows.map((r) => (ids.includes(r.source.id) ? { ...r, status: "generating", running: true, error: null } : r)));
  try {
    const summary = await runGeneration({
      root: ctx.refs.root.current as DirHandleLike,
      apiKey: ctx.refs.key.current ?? "",
      config: run.config, caps: run.caps, params: run.params, prompt: run.prompt,
      sources: run.sources, metas: ctx.refs.metas, signal: controller.signal,
      onEvent: withRunLog((event) => onRunEvent(event, ctx)),
    });
    // The finished run stays visible: its per-request outcomes are the record
    // of what was sent, what it cost and what failed (the batch strip shows it).
    await reloadSidecars(ctx.refs, run.sources, ctx);
    ctx.say(summaryLine(summary), summary.saved === 0 && summary.problems.length > 0);
  } finally {
    ctx.refs.abort.current = null;
    ctx.dispatch({ type: "running", running: false });
  }
}

/** The queue's own actions: drop one waiting batch, or all of them. */
function useQueueActions(ctx: SvgCtx): Slice<"removeQueued" | "clearQueue"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const removeQueued = useCallback((id: string) => {
    const c = latest.current;
    dropQueued(c.refs.queue, id, (queue) => c.setQueue([...queue]));
    log({ feature: "svg", action: "queue-removed", detail: id });
  }, []);
  const clearQueue = useCallback(() => {
    const n = clearQueueNow(latest.current);
    latest.current.say(`${n} queued batch${n === 1 ? "" : "es"} dropped`);
  }, []);
  return { removeQueued, clearQueue };
}

/** Empties the worker's waiting list and returns how many batches died. */
function clearQueueNow(ctx: SvgCtx): number {
  const dropped = ctx.refs.queue.pending.current.length;
  clearQueued(ctx.refs.queue, (queue) => ctx.setQueue([...queue]));
  return dropped;
}
