// runflow.ts — the life of one confirmed run: begin (close the dialog, mark the
// rows, remember the run id), post the PREPARED requests, finish (reload the
// sidecars, say the one summary line). Split from actions.ts by concept: the
// actions are what the user can press, this is what pressing "Generate now" starts.
// The run id is made here and stamped on every log entry of the run.

import type { PreparedRun } from "../lib/svgpayload";
import type { DirHandleLike } from "../lib/fs";
import { newId } from "../log/logger";
import type { SvgCtx } from "./actions";
import { onRunEvent, reloadSidecars, summaryLine } from "./runstate";
import { logConfirmAccept, logRunDone, logRunStart, tapRun } from "./runlog";
import { runGeneration, type RunSummary } from "./runner";
import type { SvgSource } from "./sources";

/** The id of the run each in-flight controller belongs to, so a Cancel can name it in the log. */
const runIds = new WeakMap<AbortController, string>();

export const runIdOf = (controller: AbortController | null): string | null =>
  (controller === null ? null : runIds.get(controller) ?? null);

/**
 * One confirmation = one run: a second click while running is ignored. The run
 * posts `prepared` — the object the dialog rendered — and re-reads nothing.
 */
export async function confirmRun(ctx: SvgCtx, prepared: PreparedRun): Promise<void> {
  const dialog = ctx.m.dialog;
  if (dialog === null || dialog.kind !== "confirm" || ctx.m.running) return;
  const run = newId("r");
  const { controller, sources } = beginRun(ctx, dialog.ids, run);
  logConfirmAccept(run, prepared, dialog.ids.length);
  logRunStart(run, prepared, ctx.m.config);
  const tap = tapRun({ run, model: prepared.model });
  const summary = await runGeneration({
    root: ctx.refs.root.current as DirHandleLike, apiKey: ctx.refs.key.current ?? "",
    config: ctx.m.config, prepared, sources, sidecars: ctx.refs.sidecars, signal: controller.signal,
    onEvent: (event) => { tap(event); onRunEvent(event, ctx); },
  });
  logRunDone(run, summary);
  await finishRun(ctx, sources, summary);
}

/** Closes the dialog, marks the rows busy and hands back what the run needs. */
function beginRun(ctx: SvgCtx, ids: string[], run: string): { controller: AbortController; sources: SvgSource[] } {
  ctx.dispatch({ type: "dialog", dialog: null });
  const controller = new AbortController();
  ctx.refs.abort.current = controller;
  runIds.set(controller, run);
  ctx.dispatch({ type: "running", running: true });
  ctx.setRowsFn((rows) => rows.map((r) => (ids.includes(r.source.id) ? { ...r, status: "generating", running: true, error: null } : r)));
  return { controller, sources: ctx.rows.filter((r) => ids.includes(r.source.id)).map((r) => r.source) };
}

async function finishRun(ctx: SvgCtx, sources: SvgSource[], summary: RunSummary): Promise<void> {
  ctx.dispatch({ type: "running", running: false });
  ctx.dispatch({ type: "progress", progress: null });
  ctx.refs.abort.current = null;
  await reloadSidecars(ctx.refs, sources, ctx);
  ctx.say(summaryLine(summary), summary.saved === 0 && summary.problems.length > 0);
}
