// reviewmerge.ts — what the review list shows: pairs plus stored decisions.
// Owns: ReviewItem (pair + review status), optimistic decision updates, the
// counters, history records whose files are gone, and the "next pending image"
// roll-over the comparison window uses after a decision (spec §6, §7, §9).

import type { Decision, DecisionRecord } from "./reviewfile";
import type { ReviewPair } from "./review";
import { compareText } from "./text";

export interface ReviewItem extends ReviewPair {
  status: Decision;
  reviewedAt: string | null;
}

export interface Counts {
  total: number;
  pending: number;
  approved: number;
  declined: number;
}

/** No saved record ⇒ pending; "processed" never implies approved (spec §7). */
export function applyDecisions(pairs: ReviewPair[], records: DecisionRecord[]): ReviewItem[] {
  const index = new Map(records.map((r) => [r.pair_id.toLowerCase(), r]));
  return pairs.map((pair) => toItem(pair, index.get(pair.id.toLowerCase())));
}

function toItem(pair: ReviewPair, record: DecisionRecord | undefined): ReviewItem {
  return { ...pair, status: record?.decision ?? "pending", reviewedAt: record?.reviewed_at ?? null };
}

/** Applies a decision locally (RULE 24); the caller persists it afterwards. */
export function withDecision(items: ReviewItem[], id: string, decision: Decision, now: string): ReviewItem[] {
  return items.map((item) => (item.id === id ? { ...item, status: decision, reviewedAt: now } : item));
}

export function recordForItem(item: ReviewItem, decision: Decision, now: string): DecisionRecord {
  return {
    pair_id: item.id,
    source: item.source?.relPath ?? "",
    ai_result: item.ai?.relPath ?? "",
    decision,
    reviewed_at: now,
  };
}

export function tally(items: ReviewItem[]): Counts {
  const count = (status: Decision) => items.filter((i) => i.status === status).length;
  return {
    total: items.length,
    pending: count("pending"),
    approved: count("approved"),
    declined: count("declined"),
  };
}

/** Entries that cannot be compared: a missing side, or a failed thumbnail. */
export function needsAttention(items: ReviewItem[], failedThumbs: Set<string>): number {
  return items.filter((item) => item.kind !== "paired" || failedThumbs.has(thumbPath(item))).length;
}

/** How many pairs carry a decision — the progress bar figure (design). */
export function reviewedCount(counts: Counts): number {
  return counts.approved + counts.declined;
}

function thumbPath(item: ReviewItem): string {
  return item.ai?.relPath ?? item.source?.relPath ?? "";
}

/** Records whose pair is no longer on disk — kept visible, never dropped. */
export function orphanRecords(records: DecisionRecord[], pairs: ReviewPair[]): DecisionRecord[] {
  const live = new Set(pairs.map((p) => p.id.toLowerCase()));
  return records
    .filter((r) => !live.has(r.pair_id.toLowerCase()))
    .sort((a, b) => compareText(a.pair_id, b.pair_id));
}

/** Next pending item after the given one, wrapping; null when none is left. */
export function nextPendingId(items: ReviewItem[], currentId: string | null): string | null {
  const start = items.findIndex((item) => item.id === currentId);
  for (let step = 1; step <= items.length; step++) {
    const item = items[(start + step + items.length) % items.length];
    if (item.status === "pending") return item.id;
  }
  return null;
}
