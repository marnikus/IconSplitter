// runplan.ts — how the Generate SVG tab turns a selection into requests
// (RULE 2): the planned split, the size one request carries, and the reason a
// run cannot start. Pure functions over the action context, so `actions.ts`
// holds hooks only — and the confirmation dialog, the runner and the batch
// strip all see the SAME plan (RUN-1).

import { planBatches, type BatchPlan } from "../lib/svgbatch";
import { inIdOrder } from "../lib/selectionorder";
import { MAIN_PLAN, requestSizeFor, type RegenPlan } from "../lib/svgregen";
import { toBatchSource } from "./sources";
import { resolveRegen } from "./regenstore";
import type { SvgCtx } from "./actions";

/** What planning needs: the rows to split and the size the user configured. */
export interface PlanCtx {
  rows: SvgCtx["rows"];
  m: Pick<SvgCtx["m"], "config">;
}

/**
 * The one split the confirmation and the run both see (RUN-1), in the order the
 * icons were picked: the sheet of the first request carries the first picks, so
 * the previewed sheet and the sent sheet are the same picture (see
 * lib/selectionorder).
 */
export function planOf(c: PlanCtx, ids: string[]): BatchPlan[] {
  const picked = inIdOrder(c.rows, ids, (r) => r.source.id);
  return planBatches(picked.map((r) => toBatchSource(r.source)), perRequestOf(c));
}

/**
 * Icons one request carries: the user's configured size, nothing else. The
 * reasoning tier changes only how long silence is tolerated (2026-10-05 D1).
 */
export function perRequestOf(c: PlanCtx): number {
  return requestSizeFor(c.m.config.imagesPerRequest, plannedRegen());
}

/**
 * The regeneration the next run uses. A stored choice that cannot run is
 * reported by guard() before any plan is shown; the plan itself then counts
 * the main prompt, which is what a refused run would have counted anyway.
 */
function plannedRegen(): RegenPlan {
  const regen = resolveRegen();
  return regen.ok ? regen.plan : MAIN_PLAN;
}

/** Why a run cannot start, or null when it can. Never a partial reason. */
export function guard(c: SvgCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one approved source";
  if (c.refs.root.current === null) return "Pick the source folder first";
  if (c.refs.key.current === null) return "Add your Requesty API key first — it stays on this device";
  const regen = resolveRegen();
  return regen.ok ? null : regen.problem;
}
