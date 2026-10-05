// state.ts — pure state model + reducers for Selection review (RULE 24).
// Owns the SelState shape and every transition the UI can trigger; the
// useSelection hook only wires IO + React onto these reducers so the rules
// stay unit-tested (RULE 8).

import { attentionInfo, type ReviewPair, type SideRef } from "../lib/pairing";
import { planBulk } from "../lib/reviewbulk";
import {
  carryRenamed, diffPairs, type PairDiff, type ReviewRecord,
} from "../lib/reviewfile";
import {
  ALL_FILTER, type Decision, type ListFilter, type ViewPair,
} from "../lib/reviewfilter";
import { DEFAULT_SORT, type SortState } from "../lib/reviewsort";
import type { ScanScope } from "../lib/splitscope";

export interface SelToast {
  msg: string;
  err?: boolean;
}

export interface SelState {
  rootName: string;
  /** Where the scan searched: the split output when the tree holds one (I-38). */
  scope: ScanScope;
  pairs: ViewPair[];
  records: ReviewRecord[]; // persisted set incl. orphans (never lost)
  lastDiff: PairDiff;
  lastRescanAt: number;
  filter: ListFilter;
  sort: SortState;
  selectedId: string | null;
  corrupt: boolean;
  /** Pair files that could not be read on the last scan, by path (I-43). */
  corruptFiles: string[];
  /** Pair ids whose decision could not be WRITTEN; Retry rewrites exactly these. */
  retryIds: string[];
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
    rootName: "", scope: { split: false, outside: 0 }, pairs: [], records: [],
    lastDiff: { added: 0, removed: 0, renamed: 0, unchanged: 0 },
    lastRescanAt: 0, filter: ALL_FILTER, sort: DEFAULT_SORT, selectedId: null,
    corrupt: false, corruptFiles: [], retryIds: [], writeWarn: null, awaitingRetry: 0, watcher: true,
    collapsed: false, zoom: "fit", sync: true, autoNext: true, busy: null, toast: null,
  };
}

export interface ScanLoad {
  records: ReviewRecord[];
  /** The legacy global file is unreadable (kept for the migration's report). */
  corrupt: boolean;
  /** Pair ids whose OWN file could not be read — their decision is kept. */
  corruptIds?: readonly string[];
  /** Those files' paths, for the message (never silently swallowed). */
  corruptFiles?: readonly string[];
}

/**
 * Rescan result -> new state. An unchanged pair set keeps `pairs` and `records`
 * by reference: the scan found the same snapshot, so the list must not be
 * rebuilt (design D7 — no churn, no lost row state, nothing to re-render).
 */
export function applyScan(s: SelState, scanned: ReviewPair[], load: ScanLoad, now: number): SelState {
  const corruptFiles = [...(load.corruptFiles ?? [])];
  if (samePairs(s.pairs, scanned)) {
    return { ...s, lastDiff: diffPairs(s.pairs, scanned), lastRescanAt: now, corrupt: load.corrupt, corruptFiles };
  }
  const records = mergeKept(s.records, load);
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
    lastDiff: diff, lastRescanAt: now, selectedId, corrupt: load.corrupt, corruptFiles,
  };
}

/**
 * The records to apply. A pair whose own file could not be read keeps the
 * decision already in memory — an unreadable file is never evidence that a pair
 * is pending (I-43); the legacy file's own corruption keeps everything.
 */
function mergeKept(prev: ReviewRecord[], load: ScanLoad): ReviewRecord[] {
  if (load.corrupt) return prev;
  const kept = new Set(load.corruptIds ?? []);
  if (kept.size === 0) return load.records;
  const ids = new Set(load.records.map((r) => r.pair_id));
  return [...load.records, ...prev.filter((r) => kept.has(r.pair_id) && !ids.has(r.pair_id))];
}

/** True when a rescan found exactly the sides the state already shows. */
function samePairs(prev: ViewPair[], curr: ReviewPair[]): boolean {
  if (prev.length !== curr.length) return false;
  return prev.every((p, i) => p.pairId === curr[i].pairId
    && sideKey(p.source) === sideKey(curr[i].source) && sideKey(p.ai) === sideKey(curr[i].ai));
}

function sideKey(side: SideRef | null): string {
  return side === null ? "-" : `${side.relPath}@${side.size}:${side.mtime}${side.error === null ? "" : "!"}`;
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

/**
 * Reset to pending. One transition for the whole batch, so a bulk reset is one
 * history entry and one summary message. A pending pair owns no stored record
 * (I-13), so its record is dropped from the persisted set; the pair itself —
 * identity, paths, timestamps — is left exactly as it was.
 */
export function withReset(s: SelState, ids: readonly string[]): BulkOut {
  const decisionOf = new Map(s.pairs.map((p) => [p.pairId, p.decision]));
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    if (applied.includes(id) || skipped.includes(id)) continue; // a duplicate is not two resets
    (decisionOf.get(id) === undefined || decisionOf.get(id) === "pending" ? skipped : applied).push(id);
  }
  if (applied.length === 0) return { state: s, applied, skipped };
  const touch = new Set(applied);
  const pairs = s.pairs.map((p) => (touch.has(p.pairId) ? { ...p, decision: "pending" as const, reviewedAt: null } : p));
  return {
    state: { ...s, pairs, records: recordsFromViews(pairs, orphanOnly(s.records, pairs)) },
    applied, skipped,
  };
}

/**
 * Re-apply stored records — the canonical undo/redo path for decisions. Each
 * touched pair takes the decision its record carries, or returns to pending when
 * the entry holds none (I-13). Pairs a rescan removed are reported as skipped
 * instead of failing the whole apply, so a stale target can never corrupt the
 * history cursor (design doc §4).
 */
export function withRecords(s: SelState, touched: readonly string[], recs: ReviewRecord[]): BulkOut {
  const recById = new Map(recs.map((r) => [r.pair_id, r]));
  const known = new Set(s.pairs.map((p) => p.pairId));
  const applied = touched.filter((id) => known.has(id));
  const skipped = touched.filter((id) => !known.has(id));
  if (applied.length === 0) return { state: s, applied, skipped };
  const touch = new Set(applied);
  const pairs = s.pairs.map((p) => (touch.has(p.pairId) ? toRecorded(p, recById.get(p.pairId)) : p));
  return {
    state: { ...s, pairs, records: recordsFromViews(pairs, orphanOnly(s.records, pairs)) },
    applied, skipped,
  };
}

function toRecorded(p: ViewPair, rec: ReviewRecord | undefined): ViewPair {
  if (!rec) return { ...p, decision: "pending" as const, reviewedAt: null };
  return { ...p, decision: rec.decision, reviewedAt: rec.reviewed_at };
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
