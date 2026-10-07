// runplan.ts — how the Generate SVG tab turns a selection into requests
// (RULE 2): the planned split, the size one request carries, and the reason a
// run cannot start. Pure functions over the action context, so `actions.ts`
// holds hooks only — and the confirmation dialog, the runner and the batch
// strip all see the SAME plan (RUN-1).

import { planBatches, type BatchPlan } from "../lib/svgbatch";
import { clampImagesPerRequest } from "../lib/svgconfig";
import { toBatchSource } from "./sources";
import type { SvgCtx } from "./actions";

/** What planning needs: the rows to split and the size the user configured. */
export interface PlanCtx {
  rows: SvgCtx["rows"];
  m: Pick<SvgCtx["m"], "config">;
}

/** The one split the confirmation and the run both see (RUN-1). */
export function planOf(c: PlanCtx, ids: string[]): BatchPlan[] {
  const byId = new Map(c.rows.map((r) => [r.source.id, r] as const));
  const sources = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => r !== undefined).map((r) => toBatchSource(r.source));
  return planBatches(sources, perRequestOf(c));
}

/**
 * Icons one request carries: the user's configured size, nothing else. The
 * reasoning tier changes only how long silence is tolerated (2026-10-05 D1).
 */
export function perRequestOf(c: PlanCtx): number {
  return clampImagesPerRequest(c.m.config.imagesPerRequest);
}

/** Why a run cannot start, or null when it can. Never a partial reason. */
export function guard(c: SvgCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one approved source";
  if (c.refs.root.current === null) return "Pick the source folder first";
  if (c.refs.key.current === null) return "Add your Requesty API key first — it stays on this device";
  return null;
}
