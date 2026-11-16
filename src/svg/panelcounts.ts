// panelcounts.ts — the Generate SVG panel's derived counters, out of the render
// function so each one is computed ONCE per rows snapshot (RULE: one owner).
import { shownVersion } from "./rowmodel";
import type { SvgRow } from "./types";

export interface SvgCounts {
  eligible: number;
  generated: number;
  approved: number;
  failed: number;
}

/** The four counters above the list, in ONE pass. */
export function countsOf(rows: readonly SvgRow[]): SvgCounts {
  let generated = 0, approved = 0, failed = 0;
  for (const r of rows) {
    if (r.status === "generated") generated += 1;
    if (r.review === "approved") approved += 1;
    if (r.status === "failed") failed += 1;
  }
  return { eligible: rows.length, generated, approved, failed };
}

/**
 * Selected rows that actually have a valid SVG to approve or decline.
 *
 * Was `affected.filter(id => rows.find(x => x.source.id === id))` inside the
 * render: O(affected × rows) on EVERY render — 6.5 ms at 1,000 rows and 131 ms
 * at 5,000. One pass over the rows, then a membership test per affected id.
 */
export function decidableCount(rows: readonly SvgRow[], affected: readonly string[]): number {
  if (affected.length === 0) return 0;
  const decidable = new Set<string>();
  for (const r of rows) if (shownVersion(r) !== null) decidable.add(r.source.id);
  let count = 0;
  for (const id of affected) if (decidable.has(id)) count += 1;
  return count;
}
