// runflow.ts — the run half of the Generate SVG actions (RULE 25): the guard
// and the plan the confirmation shows, the confirmation itself, and one
// confirmation = one run under one journal id. The runner emits facts; the
// tap (svg/runlog) mirrors them into the global log beside the UI (D8).

import { useCallback, useRef } from "react";
import { planBatches, requestCount, validateBatchPlan, type BatchPlan } from "../lib/svgbatch";
import { clampImagesPerRequest } from "../lib/svgconfig";
import type { DirHandleLike } from "../lib/fs";
import { newRunId } from "./journal";
import { onRunEvent, reloadSidecars, summaryLine } from "./runstate";
import type { RunSummary } from "./runtypes";
import { logConfirmAccept, logConfirmCancel, logConfirmOpen, logRunCancel, logRunDone, logRunStart, tapRun } from "./runlog";
import { runGeneration } from "./runner";
import { toBatchSource, type SvgSource } from "./sources";
import type { SvgCtx, Slice } from "./actions";
import type { Dialog } from "./types";

export function useRunActions(ctx: SvgCtx): Slice<"requestGenerate" | "cancelRun" | "confirmGenerate" | "dismissDialog"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const requestGenerate = useCallback((ids: string[]) => {
    const c = latest.current;
    const why = guard(c, ids);
    if (why !== null) return c.say(why, true);
    // The plan the user confirms is the plan the runner will send (RULE 10):
    // one splitter, one effective per-request size, validated before the dialog.
    const problems = validateBatchPlan(planOf(c, ids), perRequestOf(c));
    if (problems.length > 0) return c.say(problems[0], true);
    const dialog: Dialog = { kind: "confirm", ids };
    c.dispatch({ type: "dialog", dialog });
    logConfirmOpen(ids.length, requestCount(ids.length, perRequestOf(c)));
  }, []);
  const cancelRun = useCallback(() => {
    const c = latest.current;
    c.refs.abort.current?.abort();
    logRunCancel(c.refs.run.current);
    c.say("Cancelling — finished results are kept");
  }, []);
  const confirmGenerate = useCallback(() => { void confirmRun(latest.current); }, []);
  const dismissDialog = useCallback(() => closeDialog(latest.current), []);
  return { requestGenerate, cancelRun, confirmGenerate, dismissDialog };
}

/** Closing a confirmation without sending is itself worth a line in the log. */
function closeDialog(c: SvgCtx): void {
  if (c.m.dialog?.kind === "confirm") logConfirmCancel(c.m.dialog.ids.length);
  c.dispatch({ type: "dialog", dialog: null });
}

/** The one split the confirmation and the run both see (RUN-1). */
function planOf(c: SvgCtx, ids: string[]): BatchPlan[] {
  const sources = c.rows.filter((r) => ids.includes(r.source.id)).map((r) => toBatchSource(r.source));
  return planBatches(sources, perRequestOf(c));
}

/**
 * Icons one request carries: the user's configured size, nothing else. The
 * reasoning tier changes only how long silence is tolerated (2026-10-05 D1).
 */
function perRequestOf(c: SvgCtx): number {
  return clampImagesPerRequest(c.m.config.imagesPerRequest);
}

/** Why a run cannot start, or null when it can. Never a partial reason. */
function guard(c: SvgCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one approved source";
  if (c.refs.root.current === null) return "Pick the source folder first";
  if (c.refs.key.current === null) return "Add your Requesty API key first — it stays on this device";
  return null;
}

/** One confirmation = one run: a second click while running is ignored. */
async function confirmRun(ctx: SvgCtx): Promise<void> {
  const dialog = ctx.m.dialog;
  if (dialog === null || dialog.kind !== "confirm" || ctx.m.running) return;
  const { runId, controller, sources } = beginRun(ctx, dialog.ids, planOf(ctx, dialog.ids));
  // The runner emits facts; the tap mirrors them into the log beside the UI.
  const mirror = tapRun({ run: runId, model: ctx.m.config.model });
  const summary = await runGeneration({
    runId,
    root: ctx.refs.root.current as DirHandleLike,
    apiKey: ctx.refs.key.current ?? "",
    config: ctx.m.config, caps: ctx.m.caps, params: ctx.m.params, prompt: ctx.m.prompt, sources,
    sidecars: ctx.refs.sidecars, signal: controller.signal,
    onEvent: (event) => { onRunEvent(event, ctx); mirror(event); },
  });
  await finishRun(ctx, runId, summary, sources);
}

/** Closes the dialog, arms the run's id, controller and rows, says both lines. */
function beginRun(ctx: SvgCtx, ids: string[], plans: BatchPlan[]): { runId: string; controller: AbortController; sources: SvgSource[] } {
  const runId = newRunId();
  const controller = new AbortController();
  ctx.dispatch({ type: "dialog", dialog: null });
  ctx.refs.abort.current = controller;
  ctx.refs.run.current = runId;
  ctx.dispatch({ type: "running", running: true });
  ctx.setRowsFn((rows) => rows.map((r) => (ids.includes(r.source.id) ? { ...r, status: "generating", running: true, error: null } : r)));
  const sources = ctx.rows.filter((r) => ids.includes(r.source.id)).map((r) => r.source);
  logConfirmAccept(runId, ids.length, plans.length);
  logRunStart(runId, { sources: sources.length, requests: plans.length, model: ctx.m.config.model, retries: ctx.m.config.retries, timeoutMs: ctx.m.config.timeoutMs });
  return { runId, controller, sources };
}

/** The finished run stays visible: its per-request outcomes are the record of what was sent and what it cost. */
async function finishRun(ctx: SvgCtx, runId: string, summary: RunSummary, sources: SvgSource[]): Promise<void> {
  ctx.dispatch({ type: "running", running: false });
  ctx.refs.abort.current = null;
  ctx.refs.run.current = null;
  await reloadSidecars(ctx.refs, sources, ctx);
  logRunDone(runId, summary);
  ctx.say(summaryLine(summary), summary.saved === 0 && summary.problems.length > 0);
}
