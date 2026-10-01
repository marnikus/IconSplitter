// reviewsnapshot.ts — the minimal decision state an undo entry carries
// (request §7): one row per affected pair id, never a whole-app snapshot.
// Pure; applying a snapshot onto SelState is `withDecisionStates` in
// `src/selection/state.ts`, so the lib layer keeps no UI state.

import type { Decision, ViewPair } from "./reviewfilter";

export interface DecisionState {
  id: string;
  decision: Decision;
  reviewedAt: string | null;
}

/** Minimal before/after state of `ids`, in visible order, unknown ids ignored. */
export function decisionStates(pairs: readonly ViewPair[], ids: readonly string[]): DecisionState[] {
  const wanted = new Set(ids);
  return pairs
    .filter((p) => wanted.has(p.pairId))
    .map((p) => ({ id: p.pairId, decision: p.decision, reviewedAt: p.reviewedAt }));
}

/** Target ids a restored entry can no longer reach — the compaction signal. */
export function missingTargets(pairs: readonly ViewPair[], ids: readonly string[]): string[] {
  const known = new Set(pairs.map((p) => p.pairId));
  return ids.filter((id) => !known.has(id));
}
