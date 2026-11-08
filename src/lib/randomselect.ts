// randomselect.ts — "Select random" for the two upload tabs (2026-11-08).
// Pure pool + draw rules: no checks means the whole listed set; existing checks
// narrow the pool to themselves; a requested count above the pool draws the pool.

import { randomBatchOrder } from "./randomorder";

export const RANDOM_SELECT_MIN = 2;

/** A whole number above 1; empty/invalid/below-min input falls back to 2. */
export function normalizeRandomCount(raw: unknown): number {
  const n = typeof raw === "number" ? raw
    : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n) || n < RANDOM_SELECT_MIN) return RANDOM_SELECT_MIN;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
}

/** The eligible ids: existing checks when there are any, else the whole list. */
export function randomSelectionPool(allIds: readonly string[], checkedIds: readonly string[]): string[] {
  const all = [...new Set(allIds)];
  if (checkedIds.length === 0) return all;
  const checked = new Set(checkedIds);
  return all.filter((id) => checked.has(id));
}

/** N distinct random ids from the pool, capped at its size; never mutates it. */
export function drawRandomIds(pool: readonly string[], count: unknown, rng: () => number = Math.random): string[] {
  const n = Math.min(pool.length, normalizeRandomCount(count));
  return randomBatchOrder(pool.length, rng).slice(0, n).map((index) => pool[index]);
}

/** The one toast line both tabs report after a draw that changed the selection. */
export function randomSelectionMessage(count: number): string {
  return `Selected ${count} random item${count === 1 ? "" : "s"}`;
}
