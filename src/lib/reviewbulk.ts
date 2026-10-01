// reviewbulk.ts — pure bulk-review rule for Selection review V2 (spec V2 §6).
// Owns: which ids a bulk decision may touch (incomplete pairs are skipped,
// never approved silently — RULE 4) and the ONE summary line an operation
// reports, so approving 200 pairs never produces 200 toasts.

import { attentionInfo } from "./pairing";
import type { Decision, ViewPair } from "./reviewfilter";
import { checkedInView } from "./reviewselect";

export interface BulkPlan {
  eligible: string[];
  skipped: string[];
}

/** Splits requested ids into appliable pairs and pairs that must be skipped. */
export function planBulk(pairs: readonly ViewPair[], ids: readonly string[]): BulkPlan {
  const byId = new Map(pairs.map((p) => [p.pairId, p]));
  const plan: BulkPlan = { eligible: [], skipped: [] };
  for (const id of ids) {
    const pair = byId.get(id);
    const appliable = pair !== undefined && attentionInfo(pair) === null;
    if (appliable) plan.eligible.push(id);
    else plan.skipped.push(id);
  }
  return plan;
}

export interface BulkScope {
  affected: string[]; // checked, visible AND complete — what a bulk action changes
  blocked: number; // checked + visible but incomplete: reported, never approved
  hidden: number; // checked, but filtered out of the current view
}

/**
 * Resolves the scope of a bulk action (spec V2 §5/§6): hidden checks are never
 * applied silently and an incomplete pair is never counted as affected.
 */
export function bulkScope(visible: readonly ViewPair[], checked: readonly string[]): BulkScope {
  const inView = checkedInView(visible.map((p) => p.pairId), checked);
  const complete = new Set(visible.filter((p) => attentionInfo(p) === null).map((p) => p.pairId));
  const affected = inView.filter((id) => complete.has(id));
  return { affected, blocked: inView.length - affected.length, hidden: checked.length - inView.length };
}

export interface BulkOutcome {
  decision: Decision;
  applied: number;
  skipped: number;
  saved: boolean;
}

/** Why a pair was left out — it differs for a reset (already pending is fine). */
const SKIP_REASON: Record<Decision, string> = {
  pending: "already pending or gone",
  approved: "incomplete or gone",
  declined: "incomplete or gone",
};

/** The single honest line a bulk operation reports (RULE 2, RULE 4). */
export function bulkMessage(o: BulkOutcome): string {
  const parts = [appliedText(o)];
  if (o.skipped > 0) parts.push(`${o.skipped} skipped (${SKIP_REASON[o.decision]})`);
  if (!o.saved) parts.push("save failed — retry");
  return parts.join(" · ");
}

function appliedText(o: BulkOutcome): string {
  if (o.applied === 0) return "No eligible pairs";
  const noun = `pair${o.applied === 1 ? "" : "s"}`;
  return o.decision === "pending" ? `${o.applied} ${noun} reset to pending` : `${o.applied} ${noun} ${o.decision}`;
}
