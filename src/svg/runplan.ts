// runplan.ts — how the Generate SVG tab turns a selection into requests
// (RULE 2): the planned split, the size one request carries, and the reason a
// run cannot start. Pure functions over the action context, so `actions.ts`
// holds hooks only — and the confirmation dialog, the runner and the batch
// strip all see the SAME plan (RUN-1).

import { planBatches, type BatchPlan } from "../lib/svgbatch";
import { inIdOrder } from "../lib/selectionorder";
import { clampImagesPerRequest } from "../lib/svgconfig";
import { toBatchSource } from "./sources";
import { loadRegenSettings } from "./regenstore";
import { loadPresets } from "../upload/promptstore";
import type { SvgRow } from "./types";
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
  return planWithRegen(c.rows, ids, perRequestOf(c), effectiveRegen());
}

/** The option as a run can act on it (D3): a name with no saved preset behind it is OFF. */
export interface RegenRun {
  /** enabled AND a preset text resolved — the only state that changes a request. */
  on: boolean;
  preset: string;
  presetText: string | null;
}

/** One read of the store + the preset list, shared by confirm, queue and run. */
export function effectiveRegen(): RegenRun {
  const s = loadRegenSettings();
  const text = s.enabled && s.preset !== "" ? loadPresets().find((p) => p.name === s.preset)?.text ?? null : null;
  return { on: s.enabled && text !== null, preset: s.preset, presetText: text };
}

/**
 * Rows this run will regenerate from their current SVG (D4/D5): the option is
 * armed and the row already has a generated version. The confirmation, the
 * queue line and the run all mark solo from THIS list, so they cannot drift.
 */
export function regenMarked(rows: readonly SvgRow[], ids: string[], regen: RegenRun): SvgRow[] {
  if (!regen.on) return [];
  const hasCode = (r: SvgRow): boolean => (r.meta?.versions ?? []).some((v) => v.status === "generated");
  return inIdOrder(rows, ids, (r) => r.source.id).filter(hasCode);
}

/** The one split with the solo rule applied (RUN-1 + D4). */
export function planWithRegen(rows: readonly SvgRow[], ids: string[], perRequest: number, regen: RegenRun): BatchPlan[] {
  const marked = new Set(regenMarked(rows, ids, regen).map((r) => r.source.id));
  const picked = inIdOrder(rows, ids, (r) => r.source.id);
  return planBatches(picked.map((r) => ({ ...toBatchSource(r.source), solo: marked.has(r.source.id) || undefined })), perRequest);
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
