// state.ts — pure state model + reducers for Selection review (RULE 24).
// Owns the SelState shape and every transition the UI can trigger; the
// useSelection hook only wires IO + React onto these reducers so the rules
// stay unit-tested (RULE 8).

import { attentionInfo, type ReviewPair } from "../lib/pairing";
import { planBulk } from "../lib/reviewbulk";
import {
  carryRenamed, diffPairs, type PairDiff, type ReviewRecord,
} from "../lib/reviewfile";
import {
  ALL_FILTER, type Decision, type ListFilter, type ViewPair,
} from "../lib/reviewfilter";
import { DEFAULT_SORT, type SortState } from "../lib/reviewsort";
import { DEFAULT_PREFS, type ReviewPrefs } from "../lib/reviewprefs";
import { planReset } from "../lib/reviewreset";
import type { DecisionState } from "../lib/reviewsnapshot";

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
  checked: string[]; // checkbox selection, stable pair ids (survives filtering)
  prefs: ReviewPrefs; // layout mode + thumbnail zoom (V2)
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

/** Persisted view values a user command may patch (not navigation state). */
export type ViewPatch = Partial<Pick<SelState, "filter" | "sort" | "prefs" | "watcher" | "collapsed" | "zoom" | "sync" | "autoNext">>;

export function initialSelState(over: Partial<SelState> = {}): SelState {
  return {
    rootName: "", pairs: [], records: [], lastDiff: { added: 0, removed: 0, renamed: 0, unchanged: 0 },
    lastRescanAt: 0, filter: ALL_FILTER, sort: DEFAULT_SORT, selectedId: null,
    checked: [], prefs: { ...DEFAULT_PREFS },
    corrupt: false, writeWarn: null, awaitingRetry: 0, watcher: true,
    collapsed: false, zoom: "fit", sync: true, autoNext: true, busy: null, toast: null,
    ...over,
  };
}

/** Applies one persisted view patch in a single transition (request §3). */
export function withViewPatch(s: SelState, patch: ViewPatch): SelState {
  return { ...s, ...patch };
}

/** Checkbox selection limited to ids the current scan still knows (request §1). */
export function withChecked(s: SelState, checked: readonly string[]): SelState {
  const known = new Set(s.pairs.map((p) => p.pairId));
  return { ...s, checked: [...new Set(checked)].filter((id) => known.has(id)) };
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

export interface BulkOut {
  state: SelState;
  applied: string[];
  skipped: string[];
}

/**
 * One transition for a whole batch (spec V2 §6): records are rebuilt once and
 * incomplete pairs are skipped instead of silently approved (RULE 4).
 */
export function withBulkDecision(s: SelState, ids: string[], decision: Decision, nowIso: string): BulkOut {
  const plan = planBulk(s.pairs, ids);
  if (plan.eligible.length === 0) return { state: s, applied: [], skipped: plan.skipped };
  const touch = new Set(plan.eligible);
  const pairs = s.pairs.map((p) => (touch.has(p.pairId) ? { ...p, decision, reviewedAt: nowIso } : p));
  return {
    state: { ...s, pairs, records: recordsFromViews(pairs, orphanOnly(s.records, pairs)) },
    applied: plan.eligible,
    skipped: plan.skipped,
  };
}

export interface ResetOut {
  state: SelState;
  applied: string[];
  skipped: string[];
}

/**
 * Reset to pending (request §2): clears the decision AND the record — a pair
 * without a stored decision is pending (I-13). One transition for the whole
 * scope; pair identity, both sides and all file metadata are untouched.
 */
export function withResetDecision(s: SelState, ids: string[]): ResetOut {
  const plan = planReset(s.pairs, ids);
  if (plan.resettable.length === 0) return { state: s, applied: [], skipped: plan.skipped };
  const touch = new Set(plan.resettable);
  const pairs = s.pairs.map((p) => (touch.has(p.pairId) ? { ...p, decision: "pending" as const, reviewedAt: null } : p));
  return {
    state: { ...s, pairs, records: recordsFromViews(pairs, orphanOnly(s.records, pairs)) },
    applied: plan.resettable,
    skipped: plan.skipped,
  };
}

export interface ApplyOut {
  state: SelState;
  changed: number;
}

/**
 * Replay path for Undo/Redo (request §3/§9): applies a decision snapshot in
 * ONE transition through the same reducer a click uses. Ids that the current
 * scan no longer has are ignored, so a stale entry can never corrupt state.
 */
export function withDecisionStates(s: SelState, states: readonly DecisionState[]): ApplyOut {
  const byId = new Map(states.map((d) => [d.id, d]));
  let changed = 0;
  const pairs = s.pairs.map((p) => {
    const want = byId.get(p.pairId);
    if (!want || (want.decision === p.decision && want.reviewedAt === p.reviewedAt)) return p;
    changed++;
    return { ...p, decision: want.decision, reviewedAt: want.reviewedAt };
  });
  if (changed === 0) return { state: s, changed: 0 };
  return { state: { ...s, pairs, records: recordsFromViews(pairs, orphanOnly(s.records, pairs)) }, changed };
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
