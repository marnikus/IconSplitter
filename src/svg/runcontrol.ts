// Confirmed runs start concurrently when their source leases and slots permit.
// Conflicting work remains in the visible, session-only queue; no run is interrupted.
import { log } from "../log/logstore";
import { regenPlanFromPresetName, type RegenPlan } from "../lib/svgregen";
import { armCompletionSound } from "../ui/completionSound";
import { dropAll, dropQueued as removeQueued, queuedCount } from "./runqueue";
import { enqueueBatch } from "./runqueuepath";
import { setQueue } from "./runcontext";
import { imagesBusy, jobStore } from "./jobstate";
import { pumpRuns } from "./runjobs";
import type { ConfirmedBatch } from "./types";
import type { RunCtx } from "./runcontext";

export type { CancelNote } from "./runcontext";
export type { ConfirmedBatch } from "./types";

/**
 * One confirmation = one queued batch. It starts now when nothing is in flight,
 * and simply waits (in confirmation order) when something is: the user's added
 * work is never dropped, and the run in flight is never interrupted.
 */
export async function confirmRun(ctx: RunCtx, confirmed: ConfirmedBatch): Promise<void> {
  const dialog = ctx.m.dialog;
  if (dialog === null || dialog.kind !== "confirm") return;
  const { ids, operation } = dialog;
  const why = confirmationProblem(ctx, ids);
  if (why !== null) return ctx.say(why, true);
  const claims = jobStore(ctx.refs).claims;
  if (claims.has(dialog)) return;
  const regen = operation === "regenerate" ? regenOf(ctx, confirmed) : null;
  if (regen === "refused") return;
  claims.add(dialog);
  ctx.dispatch({ type: "dialog", dialog: null });
  armCompletionSound();
  const frozen = { ...ctx, m: { ...ctx.m, config: { ...ctx.m.config, imagesPerRequest: confirmed.size } } };
  enqueueBatch(frozen, { ids, regen, prompt: confirmed.choice, codes: confirmed.codes });
  pumpRuns(ctx);
  const waiting = ctx.refs.queue.current.length;
  if (waiting > 0) {
    log({ feature: "svg", action: "batch-waiting", detail: `${waiting} batch(es) waiting`, data: { waiting } });
    ctx.say(`${ids.length} image(s) confirmed — waiting for source locks or a parallel slot (${waiting} queued)`);
  }
}

/** Drops one batch that is still waiting; the run in flight is untouched. */
export function dropWaiting(ctx: RunCtx, itemId: string): number {
  const before = ctx.refs.queue.current;
  const rest = removeQueued(before, itemId);
  if (rest.length === before.length) return queuedCount(before);
  setQueue(ctx, rest);
  jobStore(ctx.refs).snapshots.delete(itemId);
  return queuedCount(rest);
}

/** A cancel empties the queue too, and says how many batches that dropped. */
export function dropQueueForCancel(ctx: RunCtx): number {
  const { rest, dropped } = dropAll(ctx.refs.queue.current);
  if (dropped > 0) setQueue(ctx, rest);
  jobStore(ctx.refs).snapshots.clear();
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


/** Revalidate consent boundaries before freezing credentials or queuing work. */
function confirmationProblem(ctx: RunCtx, ids: string[]): string | null {
  if (ctx.refs.root.current === null || ctx.refs.key.current === null) return "Folder or API key is unavailable — review the run again";
  if (ctx.m.busy !== null && !ctx.m.busy.startsWith("Regenerating AI sources")) return `Wait for “${ctx.m.busy}” to finish`;
  if (imagesBusy(ctx, ids)) return "An AI source image is being edited — wait, then review the SVG inputs again; nothing was sent";
  if (ids.length === 0 || ids.some((id) => !ctx.rows.some((r) => r.source.id === id))) return "Sources changed — review the run again";
  return null;
}
