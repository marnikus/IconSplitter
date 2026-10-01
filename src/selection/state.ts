// state.ts — pure state model + reducers for Selection review (RULE 24).
// Owns the SelState shape and every transition the UI can trigger; the
// useSelection hook only wires IO + React onto these reducers so the rules
// stay unit-tested (RULE 8).

import { attentionInfo, type ReviewPair } from "../lib/pairing";
import {
  carryRenamed, diffPairs, type PairDiff, type ReviewRecord,
} from "../lib/reviewfile";
import {
  ALL_FILTER, type Decision, type ListFilter, type ViewPair,
} from "../lib/reviewfilter";
import { DEFAULT_SORT, type SortState } from "../lib/reviewsort";

export interface SelToast {
  msg: string;
  err?: boolean;
}

export interface SelState {
  rootName: string;
  pairs: ViewPair[];
  records: ReviewRecord[]; // persisted set incl. orphans (never lost)
  lastDiff: PairDiff;
  lastRescanAt: number;
  filter: ListFilter;
  sort: SortState;
  selectedId: string | null;
  corrupt: boolean;
  writeWarn: string | null;
  awaitingRetry: number;
  watcher: boolean;
  collapsed: boolean;
  zoom: "fit" | "full";
  sync: boolean;
  autoNext: boolean;
  busy: string | null;
  toast: SelToast | null;
}

export function initialSelState(): SelState {
  return {
    rootName: "", pairs: [], records: [], lastDiff: { added: 0, removed: 0, renamed: 0, unchanged: 0 },
    lastRescanAt: 0, filter: ALL_FILTER, sort: DEFAULT_SORT, selectedId: null,
    corrupt: false, writeWarn: null, awaitingRetry: 0, watcher: true,
    collapsed: false, zoom: "fit", sync: true, autoNext: true, busy: null, toast: null,
  };
}

export interface ScanLoad {
  records: ReviewRecord[];
  corrupt: boolean;
}

/** Rescan result -> new state: carry decisions, diff, counters stay derived. */
export function applyScan(s: SelState, scanned: ReviewPair[], load: ScanLoad, now: number): SelState {
  const records = load.corrupt ? s.records : load.records;
  const recMap = new Map(records.map((r) => [r.pair_id, r]));
  const carry = carryRenamed(s.pairs, scanned, recMap);
  const pairs = scanned.map((p) => carry.byId.get(p.pairId)!);
  const consumed = new Set(carry.carriedFrom);
  const viewIds = new Set(pairs.map((p) => p.pairId));
  const orphans = records.filter((r) => !viewIds.has(r.pair_id) && !consumed.has(r.pair_id));
  const diff = diffPairs(s.pairs, scanned);
  const selectedId = s.selectedId && viewIds.has(s.selectedId) ? s.selectedId : (pairs[0]?.pairId ?? null);
  return {
    ...s, pairs, records: recordsFromViews(pairs, orphans),
    lastDiff: diff, lastRescanAt: now, selectedId, corrupt: load.corrupt,
  };
}

/** Serialize-worthy records: reviewed pairs + untouched orphans (RULE 13). */
export function recordsFromViews(views: ViewPair[], orphans: ReviewRecord[]): ReviewRecord[] {
  const out: ReviewRecord[] = [];
  for (const v of views) {
    if (v.reviewedAt === null) continue;
    out.push({
      pair_id: v.pairId, source: v.source?.relPath ?? null,
      ai_result: v.ai?.relPath ?? null, decision: v.decision, reviewed_at: v.reviewedAt,
    });
  }
  const ids = new Set(out.map((r) => r.pair_id));
  return [...out, ...orphans.filter((o) => !ids.has(o.pair_id))];
}

/** Approve/decline/change a decision; unknown ids are a no-op (RULE 4). */
export function withDecision(s: SelState, pairId: string, decision: Decision, nowIso: string): SelState {
  if (!s.pairs.some((p) => p.pairId === pairId)) return s;
  const pairs = s.pairs.map((p) => (p.pairId === pairId ? { ...p, decision, reviewedAt: nowIso } : p));
  return { ...s, pairs, records: recordsFromViews(pairs, orphanOnly(s.records, pairs)) };
}

function orphanOnly(records: ReviewRecord[], views: ViewPair[]): ReviewRecord[] {
  const ids = new Set(views.map((v) => v.pairId));
  return records.filter((r) => !ids.has(r.pair_id));
}

/** Next pending pair after fromId, wrapping; null when all reviewed. */
export function nextPendingId(pairs: ViewPair[], fromId: string): string | null {
  const at = pairs.findIndex((p) => p.pairId === fromId);
  for (let step = 1; step <= pairs.length; step++) {
    const p = pairs[(at + step + pairs.length) % pairs.length];
    if (p.decision === "pending") return p.pairId;
  }
  return null;
}

export interface Counters {
  total: number;
  pending: number;
  approved: number;
  declined: number;
  attention: number;
}

export function counters(pairs: ViewPair[]): Counters {
  const c: Counters = { total: pairs.length, pending: 0, approved: 0, declined: 0, attention: 0 };
  for (const p of pairs) {
    c[p.decision]++;
    if (attentionInfo(p)) c.attention++;
  }
  return c;
}
