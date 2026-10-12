// batchreview.ts — pure split-review semantics for Batch folders (RULE 3/8).
// Owns: the expected-icon-count setting (clamp/validate), the preview
// classification (exactly N icons -> approved, every other outcome ->
// declined) and the decidability/counter helpers the gate and bar read.
// Pure: no IO, no React.

import type { ReviewStatus } from "./reviewstatus";

export const DEFAULT_EXPECTED_ICONS = 4;
const MIN_EXPECTED = 1;
const MAX_EXPECTED = 64;

/** Finite integer 1..64; junk and out-of-range fall back sanely (RULE 13). */
export function clampExpectedIcons(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_EXPECTED_ICONS;
  const n = Math.trunc(v);
  return Math.min(MAX_EXPECTED, Math.max(MIN_EXPECTED, n));
}

/** The review a finished preview assigns: exactly N icons approved, else declined. */
export function classifySplitCount(count: number, expected: number): Extract<ReviewStatus, "approved" | "declined"> {
  return count === expected ? "approved" : "declined";
}

/** Rows the review can act on: a missing/deleted file has nothing to judge. */
export function isDecidableRow(r: { status: string }): boolean {
  return r.status !== "missing" && r.status !== "deleted";
}

/** The checked rows the split run may process: checked AND approved. */
export function approvedChecked<T extends { selected: boolean; review: ReviewStatus }>(rows: T[]): T[] {
  return rows.filter((r) => r.selected && r.review === "approved");
}
