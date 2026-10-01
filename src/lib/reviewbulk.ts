// reviewbulk.ts — bulk review-action planning and honest reporting (RULE 3/8).
// Owns: what a bulk action will touch (scope split vs hidden rows), what the
// confirmation must warn about (missing pairs, changed decisions), and the
// single result message carrying affected/unaffected counts (spec §6).

import { attentionInfo } from "./pairing";
import type { Decision, ViewPair } from "./reviewfilter";

export type Verdict = Exclude<Decision, "pending">;
export type BulkScope = "selected" | "visible";

export interface BulkPlan {
  ids: string[]; // rows the action will touch
  hiddenSkipped: number; // checked but filtered out — reported, never touched
}

/** Scope "selected" = checked ∩ visible; scope "visible" = every visible row. */
export function planBulk(scope: BulkScope, checked: readonly string[], visible: readonly string[]): BulkPlan {
  const vis = new Set(visible);
  const ids = scope === "visible" ? [...visible] : checked.filter((id) => vis.has(id));
  return { ids, hiddenSkipped: checked.filter((id) => !vis.has(id)).length };
}

export interface BulkSummary {
  total: number; // rows the dialog will affect
  missing: number; // of those, pairs lacking original or AI result
  changing: number; // of those, rows whose decision actually changes
}

/** Confirmation numbers: nothing missing is approved silently (spec §6). */
export function bulkSummary(pairs: ViewPair[], ids: readonly string[], verdict: Verdict): BulkSummary {
  const want = new Set(ids);
  const hit = pairs.filter((p) => want.has(p.pairId));
  return {
    total: hit.length,
    missing: hit.filter((p) => attentionInfo(p) !== null).length,
    changing: hit.filter((p) => p.decision !== verdict).length,
  };
}

/**
 * ONE result message per bulk operation (never one per image): affected /
 * unaffected counts, and on failure an honest "0 of N saved, kept in memory".
 */
export function bulkResultText(verdict: Verdict, applied: number, skipped: number, saved: boolean): string {
  const verb = verdict === "approved" ? "approve" : "decline";
  const skip = skipped > 0 ? `, ${skipped} unaffected` : "";
  return saved
    ? `Bulk ${verb}: ${applied} affected${skip} — ${applied} saved.`
    : `Bulk ${verb}: ${applied} affected${skip} — 0 of ${applied} saved to file; decisions kept in memory.`;
}
