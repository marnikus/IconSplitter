// state.ts — pure state model + reducers for Selection review (RULE 24).
// Owns the SelState shape and every transition the UI can trigger; the
// useSelection hook only wires IO + React onto these reducers so the rules
// stay unit-tested (RULE 8).

import { attentionInfo, type ReviewPair } from "../lib/pairing";
import {
  carryRenamed, diffPairs, mergeDecisions, type PairDiff, type ReviewRecord,
} from "../lib/reviewfile";
import {
  ALL_FILTER, type Decision, type ListFilter, type ViewPair,
} from "../lib/reviewfilter";
import { DEFAULT_SORT, type SortState } from "../lib/reviewsort";
import {
  emptyStack, pushEntry, type UndoOut, type UndoStack,
} from "../lib/undo";

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
  selectedIds: string[]; // checkbox multi-selection (stable pair ids)
  wrap: boolean; // navigation wraps at list ends when on
  thumbSize: "sm" | "lg";
  undo: UndoStack; // global timeline (adapted from sister app)
  undoBase: ReviewRecord[]; // records before the first history entry
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
    selectedIds: [], wrap: false, thumbSize: "sm",
    undo: emptyStack(), undoBase: [],
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
  const merged = recordsFromViews(pairs, orphans);
  return {
    ...s, pairs, records: merged,
    lastDiff: diff, lastRescanAt: now, selectedId, corrupt: load.corrupt,
    selectedIds: s.selectedIds.filter((id) => viewIds.has(id)),
    undo: emptyStack(), undoBase: merged, // external changes rewrite the domain
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

/** Checkbox toggle for one pair (stable id, never a row position). */
export function toggleSelect(s: SelState, id: string): SelState {
  const on = s.selectedIds.includes(id);
  return { ...s, selectedIds: on ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] };
}

/** Select / deselect exactly the visible ids; hidden selection is untouched. */
export function selectVisible(s: SelState, visibleIds: string[], on: boolean): SelState {
  const vis = new Set(visibleIds);
  const kept = s.selectedIds.filter((x) => !vis.has(x));
  return { ...s, selectedIds: on ? [...kept, ...visibleIds] : kept };
}

/** One decision over many pairs; replaces old decisions, single record each. */
export function bulkDecide(s: SelState, ids: string[], decision: Decision, nowIso: string): SelState {
  const want = new Set(ids);
  const pairs = s.pairs.map((p) => (want.has(p.pairId) ? { ...p, decision, reviewedAt: nowIso } : p));
  if (pairs === s.pairs) return s;
  return { ...s, pairs, records: recordsFromViews(pairs, orphanOnly(s.records, pairs)) };
}

/** Step the active row through the visible order; wraps only when enabled. */
export function moveActive(s: SelState, visibleIds: string[], dir: 1 | -1): SelState {
  if (visibleIds.length === 0) return s;
  const at = visibleIds.indexOf(s.selectedId ?? "");
  if (at === -1) return { ...s, selectedId: dir === 1 ? visibleIds[0] : visibleIds[visibleIds.length - 1] };
  const next = at + dir;
  if (next < 0 || next >= visibleIds.length) {
    if (!s.wrap) return s;
    return { ...s, selectedId: visibleIds[(next + visibleIds.length) % visibleIds.length] };
  }
  return { ...s, selectedId: visibleIds[next] };
}

/** One pair back to pending: record dropped, timestamp cleared. */
export function resetDecision(s: SelState, id: string): SelState {
  return resetMany(s, [id]);
}

/** Many pairs back to pending; unknown ids ignored. */
export function bulkReset(s: SelState, ids: string[]): SelState {
  return resetMany(s, ids);
}

function resetMany(s: SelState, ids: string[]): SelState {
  const want = new Set(ids);
  const pairs = s.pairs.map((p) => (want.has(p.pairId)
    ? { ...p, decision: "pending" as Decision, reviewedAt: null }
    : p));
  return { ...s, pairs, records: recordsFromViews(pairs, orphanOnly(s.records, pairs)) };
}

/** Record a snapshot on the global timeline (never from undo/redo itself). */
export function pushUndo(s: SelState, kind: string, value: unknown): SelState {
  return { ...s, undo: pushEntry(s.undo, kind, value) };
}

export function canUndo(s: SelState): boolean {
  return s.undo.index >= 0;
}

export function canRedo(s: SelState): boolean {
  return s.undo.index < s.undo.history.length - 1;
}

/** Re-apply an undo/redo outcome onto the matching domain slice. */
export function applyUndoOut(s: SelState, out: UndoOut): SelState {
  if (out.kind === "decisions") return withRecords(s, out.empty ? s.undoBase : (out.value as ReviewRecord[]));
  if (out.kind === "select") return { ...s, selectedIds: out.empty ? [] : (out.value as string[]) };
  if (out.kind === "filter") return { ...s, filter: out.empty ? ALL_FILTER : (out.value as ListFilter) };
  if (out.kind === "sort") return { ...s, sort: out.empty ? DEFAULT_SORT : (out.value as SortState) };
  return s;
}

function withRecords(s: SelState, records: ReviewRecord[]): SelState {
  const { byId } = mergeDecisions(s.pairs, records);
  const pairs = s.pairs.map((p) => byId.get(p.pairId) ?? { ...p, decision: "pending" as Decision, reviewedAt: null });
  return { ...s, pairs, records };
}

/** Keep the active pair when visible; else the nearest visible by raw order. */
export function reconcileActive(s: SelState, visibleIds: string[]): SelState {
  if (visibleIds.length === 0) return s.selectedId === null ? s : { ...s, selectedId: null };
  if (s.selectedId && visibleIds.includes(s.selectedId)) return s;
  const raw = new Map(s.pairs.map((p, i) => [p.pairId, i]));
  const at = s.selectedId ? (raw.get(s.selectedId) ?? 0) : 0;
  let best = visibleIds[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const id of visibleIds) {
    const d = Math.abs((raw.get(id) ?? 0) - at);
    if (d < bestDist) { bestDist = d; best = id; }
  }
  return { ...s, selectedId: best };
}
