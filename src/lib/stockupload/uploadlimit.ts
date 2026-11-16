// uploadlimit.ts — "Limit" on the Upload tab (2026-11-05): upload only N icons
// of the selection this time, drawn AT RANDOM, and leave the rest for a later
// run. The draw happens once, on the plan, before the confirmation — so the
// dialog shows the real count and every site gets the same chosen icons. The
// run then walks them in random 100-icon batches (Random batches is implied by
// a limit), e.g. limit 150 of 200 → 100 + 50, and 50 stay untouched.
// Counted in icons, like the batches: a JPEG and its matching EPS are one icon.

import { randomBatchOrder } from "./gettyweb";
import type { StockUploadPlan } from "./plan";

/** What the confirmation says about a limited plan. */
export interface PlanLimit {
  /** The number the user set. */
  limit: number;
  /** Icons this run will upload (≤ limit). */
  chosen: number;
  /** Icons the selection could have uploaded. */
  total: number;
}

const MAX_LIMIT = 1_000_000;

/** A whole number above 0, or 0 for "no limit" (empty, negative, not a number). */
export function parseUploadLimit(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw.trim() === "" ? Number.NaN : raw) : typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

/**
 * The plan reduced to `limit` icons drawn at random (`rng`, Math.random by
 * default). Only icons that have something to upload are drawn from; every
 * file and every site of a chosen icon stays. A limit of 0 returns the plan.
 */
export function limitStockUploadPlan(
  plan: StockUploadPlan, limit: number, rng: () => number = Math.random,
): StockUploadPlan {
  if (limit <= 0) return plan;
  const candidates = [...new Set(plan.tasks.map((t) => t.itemId))];
  const chosen = new Set(randomBatchOrder(candidates.length, rng).slice(0, limit).map((index) => candidates[index]));
  const tasks = plan.tasks.filter((t) => chosen.has(t.itemId));
  return {
    ...plan,
    tasks,
    selectedRows: plan.selectedRows.filter((row) => chosen.has(row.id)),
    skippedMissing: plan.skippedMissing.filter((s) => chosen.has(s.itemId)),
    totalBytes: tasks.reduce((sum, t) => sum + t.estimatedBytes, 0),
    limit: { limit, chosen: chosen.size, total: candidates.length },
  };
}

/** A run draws at random when Random batches is ticked — or when a limit is set. */
export function uploadIsRandomized(prefs: { randomBatches: boolean; uploadLimit: number }): boolean {
  return prefs.randomBatches || prefs.uploadLimit > 0;
}
