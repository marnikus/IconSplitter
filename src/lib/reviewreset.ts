// reviewreset.ts — "Reset to pending" (request §2). Owns which pairs may be
// reset and the ONE summary line a bulk reset reports.
//
// Rule: reset is the safe direction — a pair can be reset whenever it carries a
// stored decision, even when one side is missing (unlike approve/decline, which
// `planBulk` restricts to complete pairs). Resetting clears the decision AND the
// record, because a pair without a stored decision IS pending (I-13); the pair,
// its sides and every file metadata field are untouched.

import type { ViewPair } from "./reviewfilter";

export interface ResetPlan {
  resettable: string[];
  skipped: string[]; // already pending, or gone from the current scan
}

/** Splits requested ids into resettable pairs and pairs that must be skipped. */
export function planReset(pairs: readonly ViewPair[], ids: readonly string[]): ResetPlan {
  const byId = new Map(pairs.map((p) => [p.pairId, p]));
  const plan: ResetPlan = { resettable: [], skipped: [] };
  for (const id of ids) {
    const pair = byId.get(id);
    (pair && isResettable(pair) ? plan.resettable : plan.skipped).push(id);
  }
  return plan;
}

/** A pair with a stored decision can go back to pending. */
export function isResettable(pair: ViewPair): boolean {
  return pair.reviewedAt !== null;
}

export function resetLabel(count: number): string {
  return `Reset ${count} pair${count === 1 ? "" : "s"} to pending`;
}

export interface ResetOutcome {
  applied: number;
  skipped: number;
  saved: boolean;
}

/** The single honest line a reset reports (RULE 2/4, spec V2 §6 pattern). */
export function resetMessage(o: ResetOutcome): string {
  const parts = [appliedText(o.applied)];
  if (o.skipped > 0) parts.push(`${o.skipped} skipped (already pending or gone)`);
  if (!o.saved) parts.push("save failed — retry");
  return parts.join(" · ");
}

function appliedText(applied: number): string {
  if (applied === 0) return "No reviewed pairs to reset";
  return `${applied} pair${applied === 1 ? "" : "s"} reset to pending`;
}
