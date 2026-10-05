// useSelection.ts — UI orchestration for Selection review (RULE 2/4/5/24).
// Thin: every rule lives in tested pure modules (state.ts, reviewstore.ts,
// pairing/scan/fs). View state (filter, sort, selected row, zoom…) lives in the
// store above the tabs, so a restart and an undo pressed on another tab can see
// it; decisions stay here and on disk, which is their own source of truth.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logStatus } from "../log/logger";
import { readDirTree, type DirHandleLike } from "../lib/fs";
import { walkTree } from "../lib/scan";
import { beginScan, isCurrent, SCAN_IDLE, type ScanSeq } from "../lib/scanseq";
import { pairEntries } from "../lib/pairing";
import { applyFilters, filterLabel, type Decision, type ListFilter, type ViewPair } from "../lib/reviewfilter";
import { sortLabel, sortPairs, type SortState } from "../lib/reviewsort";
import type { ReviewRecord } from "../lib/reviewfile";
import { pruneIds } from "../lib/session";
import { pickDirectory, fsSupported } from "../batch/picker";
import { loadHandles, saveHandles } from "../batch/store";
import { bulkMessage } from "../lib/reviewbulk";
import { getAppState, patchV2, patchView } from "../state/appstore";
import { useAppView } from "../state/useAppState";
import { useHistory, type HistoryApi } from "../state/HistoryProvider";
import { loadDecisions, saveDecisions } from "./reviewstore";
import { bindDecisionApplier, SELECTION_HANDLE_KEY, type DecisionPatch } from "./offline";
import {
  applyScan, initialSelState, nextPendingId, withBulkDecision, withDecision, withRecords,
  withReset, type BulkOut, type SelState,
} from "./state";

const WATCH_MS = 30_000;
const WRITE_WARN = "Decision file could not be written. Your pending change is retained in memory.";

const ACTION_WORD: Record<Decision, string> = { pending: "Reset", approved: "Approve", declined: "Decline" };

/** View toggles `patch()` may carry; the rest of SelState stays local. */
const VIEW_TOGGLES: Record<string, string> = {
  collapsed: "Sidebar", zoom: "Detail zoom", sync: "Sync selection", autoNext: "Auto-advance",
};

interface Ctx {
  root: { current: DirHandleLike | null };
  state: { current: SelState };
  hist: HistoryApi;
  /** Which rescan may commit (see lib/scanseq) — the watcher can overlap one. */
  seq: { current: ScanSeq };
}

type Setter = React.Dispatch<React.SetStateAction<SelState>>;

export function useSelection() {
  const view = useAppView();
  const [core, setCore] = useState(initialSelState);
  const hist = useHistory();
  const ctx = useCtx(useMerged(core, view), hist);
  useEffect(() => { void boot(ctx, setCore); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useWatcher(ctx, ctx.state.current.watcher, ctx.state.current.rootName, setCore);
  useToastClear(ctx.state.current.toast, setCore);
  useDecisionApplier(ctx, setCore);
  const s = ctx.state.current;
  const visible = useMemo(() => sortPairs(applyFilters(s.pairs, s.filter), s.sort), [s.pairs, s.filter, s.sort]);
  const say = useCallback((msg: string, err = false) => toast(setCore, msg, err), []);
  return {
    s, visible, say, supported: fsSupported(), rootRef: ctx.root,
    chooseRoot: useCallback(() => chooseRoot(ctx, setCore, say), [ctx, say]),
    rescan: useCallback(() => rescan(ctx, setCore, say), [ctx, say]),
    decide: useCallback((id: string, d: Decision) => decide(ctx, setCore, id, d), [ctx]),
    decideBulk: useCallback((ids: string[], d: Decision) => decideBulk(ctx, setCore, ids, d), [ctx]),
    resetBulk: useCallback((ids: string[]) => resetBulk(ctx, setCore, ids), [ctx]),
    retryWrite: useCallback(() => retryWrite(ctx, setCore), [ctx]),
    select: useCallback((id: string) => selectRow(ctx, id), [ctx]),
    setFilter: useCallback((f: ListFilter, gesture = false) => editView(ctx, { patch: { filter: f }, label: filterLabel(f), id: "filter", gesture }), [ctx]),
    setSort: useCallback((so: SortState) => editView(ctx, { patch: { sort: so }, label: sortLabel(so), id: "sort", gesture: false }), [ctx]),
    patch: useCallback((part: Partial<SelState>) => patchState(ctx, setCore, part), [ctx]),
  };
}

function useMerged(core: SelState, view: ReturnType<typeof useAppView>): SelState {
  return useMemo(() => ({ ...core, ...view }), [core, view]);
}

function useCtx(s: SelState, hist: HistoryApi): Ctx {
  const stateRef = useRef(s);
  stateRef.current = s; // render-mirror for async callbacks (RULE 24)
  return { root: useRef(null), state: stateRef, hist, seq: useRef(SCAN_IDLE) };
}

async function boot(ctx: Ctx, setS: Setter): Promise<void> {
  const stored = await loadHandles(SELECTION_HANDLE_KEY);
  const h = stored?.source ?? null;
  if (!h) return;
  setRoot(ctx, setS, h);
  await rescan(ctx, setS, () => undefined);
}

async function chooseRoot(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void): Promise<void> {
  const h = await pickDirectory();
  if (!h) return say("Folder picking needs Chrome or Edge — or was cancelled", true);
  setRoot(ctx, setS, h);
  void saveHandles(SELECTION_HANDLE_KEY, { source: h });
  await rescan(ctx, setS, say);
}

function setRoot(ctx: Ctx, setS: Setter, h: DirHandleLike): void {
  ctx.root.current = h;
  setS((p) => ({ ...p, rootName: h.name }));
}

export async function rescan(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  const ticket = beginScan(ctx.seq.current);
  ctx.seq.current = ticket.seq;
  setS((p) => ({ ...p, busy: "Scanning folders…" }));
  try {
    const tree = await readDirTree(root, []);
    const pairs = pairEntries(walkTree(tree, []));
    const load = await loadDecisions(root);
    if (!isCurrent(ctx.seq.current, ticket.id)) return; // a newer scan took over
    const next = applyScan(ctx.state.current, pairs, load, Date.now());
    setS(next);
    patchView({ selectedId: next.selectedId });
    pruneChecked(next.pairs); // a restored check must not point at a removed pair
    if (load.corrupt) say("review-decisions.json is corrupt — kept previous decisions in memory", true);
  } catch {
    if (isCurrent(ctx.seq.current, ticket.id)) say("Rescan failed — the folder may be unreadable", true);
  } finally {
    if (isCurrent(ctx.seq.current, ticket.id)) setS((p) => ({ ...p, busy: null }));
  }
}

function pruneChecked(pairs: ViewPair[]): void {
  const checked = getAppState().v2.checked;
  const kept = pruneIds(checked, new Set(pairs.map((p) => p.pairId)));
  if (kept.length !== checked.length) patchV2({ checked: kept });
}

function decide(ctx: Ctx, setS: Setter, id: string, d: Decision): void {
  const before = ctx.state.current;
  const merged = withDecision(before, id, d, new Date().toISOString());
  const rolled = merged.autoNext ? nextPendingId(merged.pairs, id) : null;
  const next = rolled ? { ...merged, selectedId: rolled } : merged;
  setS(next);
  if (rolled) patchView({ selectedId: rolled });
  pushDecisions(ctx, { ids: [id], before, after: next, label: `${ACTION_WORD[d]} 1 pair` });
  void persist(ctx, setS, next);
}

/** One bulk operation: one transition, one write, ONE toast, ONE history entry. */
function decideBulk(ctx: Ctx, setS: Setter, ids: string[], d: Decision): void {
  const before = ctx.state.current;
  const out = withBulkDecision(before, ids, d, new Date().toISOString());
  setS(out.state);
  if (out.applied.length === 0) return nothingApplied(setS, out, d);
  pushDecisions(ctx, { ids: out.applied, before, after: out.state, label: bulkLabel(d, out.applied.length) });
  void reportBulk(ctx, setS, out, d);
}

/** Reset to pending — undoable like any other decision (spec: reset to pending). */
function resetBulk(ctx: Ctx, setS: Setter, ids: string[]): void {
  const before = ctx.state.current;
  const out = withReset(before, ids);
  setS(out.state);
  if (out.applied.length === 0) return nothingApplied(setS, out, "pending");
  pushDecisions(ctx, { ids: out.applied, before, after: out.state, label: bulkLabel("pending", out.applied.length) });
  void reportBulk(ctx, setS, out, "pending");
}

function bulkLabel(d: Decision, applied: number): string {
  return `${ACTION_WORD[d]} ${applied} pair${applied === 1 ? "" : "s"}`;
}

/** One reversible change, as the history entry needs it. */
interface DecisionChange {
  ids: string[];
  before: SelState;
  after: SelState;
  label: string;
}

/** Minimal before/after: only the records of the pairs this action touched. */
function pushDecisions(ctx: Ctx, change: DecisionChange): void {
  ctx.hist.push({
    type: "decisions", label: change.label, origin: getAppState().tab, ids: change.ids,
    before: { recs: recordsFor(change.before, change.ids) },
    after: { recs: recordsFor(change.after, change.ids) },
  });
}

function recordsFor(s: SelState, ids: readonly string[]): ReviewRecord[] {
  const wanted = new Set(ids);
  return s.records.filter((r) => wanted.has(r.pair_id));
}

function selectRow(ctx: Ctx, id: string): void {
  const before = getAppState().view;
  if (before.selectedId === id) return;
  patchView({ selectedId: id });
  // a burst of arrow-key moves is one gesture, not one entry per row
  ctx.hist.pushGesture({ type: "view", label: "Select a row", origin: getAppState().tab, ids: ["selectedId"], before, after: { ...before, selectedId: id } });
}

interface ViewEdit {
  patch: Partial<SelState>;
  label: string;
  id: string;
  gesture: boolean;
}

function editView(ctx: Ctx, edit: ViewEdit): void {
  const before = getAppState().view;
  const after = { ...before, ...edit.patch };
  patchView(edit.patch);
  const entry = { type: "view", label: edit.label, origin: getAppState().tab, ids: [edit.id], before, after };
  if (edit.gesture) ctx.hist.pushGesture(entry);
  else ctx.hist.push(entry);
}

function patchState(ctx: Ctx, setS: Setter, part: Partial<SelState>): void {
  const core: Partial<SelState> = {};
  const view: Partial<SelState> = {};
  for (const key of Object.keys(part) as (keyof SelState)[]) {
    Object.assign(VIEW_TOGGLES[key] ? view : core, { [key]: part[key] });
  }
  if (Object.keys(core).length > 0) setS((p) => ({ ...p, ...core }));
  if (Object.keys(view).length > 0) editView(ctx, { patch: view, label: toggleLabel(view), id: "toggles", gesture: false });
}

function toggleLabel(view: Partial<SelState>): string {
  return Object.keys(view)
    .map((key) => `${VIEW_TOGGLES[key]}: ${String(view[key as keyof SelState])}`)
    .join(", ");
}

/** The toast the user sees and its mirror in the global log (L-4). */
function toast(setS: Setter, msg: string, err: boolean): void { logStatus("selection", msg, err); setS((p) => ({ ...p, toast: { msg, err } })); }

function nothingApplied(setS: Setter, out: BulkOut, d: Decision): void {
  const msg = bulkMessage({ decision: d, applied: 0, skipped: out.skipped.length, saved: true });
  toast(setS, msg, true); // honest no-op, never a fake success
}

async function reportBulk(ctx: Ctx, setS: Setter, out: BulkOut, d: Decision): Promise<void> {
  const saved = await persist(ctx, setS, out.state);
  const msg = bulkMessage({ decision: d, applied: out.applied.length, skipped: out.skipped.length, saved });
  toast(setS, msg, !saved);
}

/**
 * While this panel is mounted it owns the decision apply path, so an undo from
 * any tab lands in the same reducers a click uses. Unmounting releases it and
 * the file path takes over (see selection/offline.ts).
 */
function useDecisionApplier(ctx: Ctx, setS: Setter): void {
  useEffect(() => bindDecisionApplier((touched, patch) => applyRecords(ctx, setS, touched, patch)), [ctx, setS]);
}

async function applyRecords(ctx: Ctx, setS: Setter, touched: readonly string[], patch: DecisionPatch): Promise<boolean> {
  const out = withRecords(ctx.state.current, touched, patch.recs);
  if (out.applied.length === 0) return false; // every target is gone: report it, do not fake it
  setS(out.state);
  return persist(ctx, setS, out.state);
}

/** Writes the decision file; resolves false when memory and disk disagree. */
async function persist(ctx: Ctx, setS: Setter, s: SelState): Promise<boolean> {
  const root = ctx.root.current;
  if (!root) return true; // no root yet: in-memory review only
  try {
    await saveDecisions(root, s.records);
    setS((p) => ({ ...p, writeWarn: null, awaitingRetry: 0 }));
    return true;
  } catch {
    setS((p) => ({ ...p, writeWarn: WRITE_WARN, awaitingRetry: p.awaitingRetry + 1 }));
    return false;
  }
}

async function retryWrite(ctx: Ctx, setS: Setter): Promise<void> {
  await persist(ctx, setS, ctx.state.current);
}

function useWatcher(ctx: Ctx, on: boolean, rootName: string, setS: Setter): void {
  useEffect(() => {
    if (!on || !rootName) return;
    const t = setInterval(() => { void rescan(ctx, setS, () => undefined); }, WATCH_MS);
    return () => clearInterval(t);
  }, [on, rootName, ctx, setS]);
}

function useToastClear(toast: SelState["toast"], setS: Setter): void {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setS((p) => ({ ...p, toast: null })), 4000);
    return () => clearTimeout(t);
  }, [toast, setS]);
}

export type SelectionApi = ReturnType<typeof useSelection>;
