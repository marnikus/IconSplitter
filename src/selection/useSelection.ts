// useSelection.ts — UI orchestration for Selection review (RULE 2/4/5/24).
// Thin: every rule lives in tested pure modules (state.ts, reviewstore.ts,
// pairing/scan/fs). Keeps a render-mirror Ctx like useBatch so async callbacks
// read live state, and persists decisions after each change (spec §8).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readDirTree, type DirHandleLike } from "../lib/fs";
import { walkTree } from "../lib/scan";
import { pairEntries } from "../lib/pairing";
import { applyFilters, type ListFilter } from "../lib/reviewfilter";
import { sortPairs, type SortState } from "../lib/reviewsort";
import type { Decision } from "../lib/reviewfilter";
import { pickDirectory, fsSupported } from "../batch/picker";
import { loadHandles, saveHandles } from "../batch/store";
import { bulkMessage } from "../lib/reviewbulk";
import { loadDecisions, saveDecisions } from "./reviewstore";
import { loadUndoSave, saveUndoSave } from "./undostore";
import {
  applyScan, applyUndoOut, bulkDecide, bulkReset,
  initialSelState, moveActive, nextPendingId, pushUndo, reconcileActive,
  selectVisible, toggleSelect, withBulkDecision, withDecision,
  type BulkOut, type SelState,
} from "./state";
import { redoOnce, undoOnce } from "../lib/undo";

const HANDLE_KEY = "__selection__";
const WATCH_MS = 30_000;
const WRITE_WARN = "Decision file could not be written. Your pending change is retained in memory.";

interface Ctx {
  root: { current: DirHandleLike | null };
  state: { current: SelState };
}

type Setter = React.Dispatch<React.SetStateAction<SelState>>;

export function useSelection() {
  const [s, setS] = useState(initialSelState);
  const ctx = useCtx(s);
  useEffect(() => { void boot(ctx, setS); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useWatcher(ctx, s.watcher, s.rootName, setS);
  useToastClear(s.toast, setS);
  const visible = useMemo(() => sortPairs(applyFilters(s.pairs, s.filter), s.sort), [s.pairs, s.filter, s.sort]);
  const visibleKey = useMemo(() => visible.map((v) => v.pairId).join(","), [visible]);
  useEffect(() => { // keep the active row valid across filter/sort changes
    const ids = visibleKey === "" ? [] : visibleKey.split(",");
    setS((p) => reconcileActive(p, ids));
  }, [visibleKey]);
  const say = useCallback((msg: string, err = false) => setS((p) => ({ ...p, toast: { msg, err } })), []);
  return {
    s, visible, say, supported: fsSupported(), rootRef: ctx.root,
    ...useFlowActions(ctx, setS, say), ...useEditActions(ctx, setS),
  };
}

/** Folder / decision / timeline actions. */
function useFlowActions(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  return {
    chooseRoot: useCallback(() => chooseRoot(ctx, setS, say), [ctx, setS, say]),
    rescan: useCallback(() => rescan(ctx, setS, say), [ctx, setS, say]),
    decide: useCallback((id: string, d: Decision) => decide(ctx, setS, id, d), [ctx, setS]),
    bulk: useCallback((d: Decision) => bulk(ctx, setS, say, d), [ctx, setS, say]),
    decideBulk: useCallback((ids: string[], d: Decision) => decideBulk(ctx, setS, ids, d), [ctx, setS]),
    reset: useCallback((id: string) => resetFlow(ctx, setS, say, [id]), [ctx, setS, say]),
    bulkResetSel: useCallback(() => resetFlow(ctx, setS, say, selectedVisible(ctx)), [ctx, setS, say]),
    undo: useCallback(() => stepHistory(ctx, setS, "undo"), [ctx, setS]),
    redo: useCallback(() => stepHistory(ctx, setS, "redo"), [ctx, setS]),
    move: useCallback((dir: 1 | -1) => move(ctx, setS, dir), [ctx, setS]),
    retryWrite: useCallback(() => retryWrite(ctx, setS), [ctx, setS]),
  };
}

/** List edits — every one of these lands on the undo timeline. */
function useEditActions(ctx: Ctx, setS: Setter) {
  return {
    toggle: useCallback((id: string) => pushCommit(ctx, setS, (p) => {
      const n = toggleSelect(p, id);
      return pushUndo(n, "select", n.selectedIds);
    }), [ctx, setS]),
    selectVis: useCallback((ids: string[], on: boolean) => pushCommit(ctx, setS, (p) => {
      const n = selectVisible(p, ids, on);
      return pushUndo(n, "select", n.selectedIds);
    }), [ctx, setS]),
    select: useCallback((id: string) => setS((p) => ({ ...p, selectedId: id })), [setS]),
    setFilter: useCallback((f: ListFilter) => pushCommit(ctx, setS, (p) => pushUndo({ ...p, filter: f }, "filter", f)), [ctx, setS]),
    setSort: useCallback((so: SortState) => pushCommit(ctx, setS, (p) => pushUndo({ ...p, sort: so }, "sort", so)), [ctx, setS]),
    patch: useCallback((part: Partial<SelState>) => setS((p) => ({ ...p, ...part })), [setS]),
  };
}

function useCtx(s: SelState): Ctx {
  const stateRef = useRef(s);
  stateRef.current = s; // render-mirror for async callbacks (RULE 24)
  return { root: useRef(null), state: stateRef };
}

async function boot(ctx: Ctx, setS: Setter): Promise<void> {
  const stored = await loadHandles(HANDLE_KEY);
  const h = stored?.source ?? null;
  if (!h) return;
  setRoot(ctx, setS, h);
  await rescan(ctx, setS, () => undefined, true);
  restoreUndo(setS, h.name); // restarts keep their honest timeline
}

/** Restore the persisted timeline only when it belongs to this root. */
function restoreUndo(setS: Setter, rootName: string): void {
  const save = loadUndoSave();
  if (save.root !== rootName) return;
  setS((p) => ({ ...p, undo: save.stack, undoBase: save.base }));
}

/** Apply a state that already carries a fresh undo entry; persist the timeline. */
function pushCommit(ctx: Ctx, setS: Setter, fn: (p: SelState) => SelState): void {
  commitTimeline(ctx, setS, fn(ctx.state.current));
}

async function chooseRoot(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void): Promise<void> {
  const h = await pickDirectory();
  if (!h) return say("Folder picking needs Chrome or Edge — or was cancelled", true);
  setRoot(ctx, setS, h);
  void saveHandles(HANDLE_KEY, { source: h });
  await rescan(ctx, setS, say);
}

function setRoot(ctx: Ctx, setS: Setter, h: DirHandleLike): void {
  ctx.root.current = h;
  setS((p) => ({ ...p, rootName: h.name }));
}

export async function rescan(
  ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void, keepTimeline = false,
): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  setS((p) => ({ ...p, busy: "Scanning folders…" }));
  try {
    const tree = await readDirTree(root, []);
    const pairs = pairEntries(walkTree(tree, []));
    const load = await loadDecisions(root);
    const next = applyScan(ctx.state.current, pairs, load, Date.now());
    setS(next);
    if (!keepTimeline) saveUndoSave(next.undo, next.undoBase, root.name);
    if (load.corrupt) say("review-decisions.json is corrupt — kept previous decisions in memory", true);
  } catch {
    say("Rescan failed — the folder may be unreadable", true);
  } finally {
    setS((p) => ({ ...p, busy: null }));
  }
}

function decide(ctx: Ctx, setS: Setter, id: string, d: Decision): void {
  const merged = withDecision(ctx.state.current, id, d, new Date().toISOString());
  const rolled = merged.autoNext ? nextPendingId(merged.pairs, id) : null;
  const next = pushUndo(rolled ? { ...merged, selectedId: rolled } : merged, "decisions", merged.records);
  commitTimeline(ctx, setS, next);
  void persist(ctx, setS, next);
}

/** Reset-to-pending for the given ids; one undo entry + one save + one toast. */
function resetFlow(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void, ids: string[]): void {
  const s = ctx.state.current;
  const affected = ids.filter((id) => s.pairs.some((p) => p.pairId === id && p.decision !== "pending"));
  if (affected.length === 0) return;
  const reset = bulkReset(s, affected);
  const next = pushUndo(reset, "decisions", reset.records);
  commitTimeline(ctx, setS, next);
  say(`Reset ${affected.length} pair${affected.length === 1 ? "" : "s"} to pending`);
  void persist(ctx, setS, next);
}

/** setS + timeline persistence — every recorded change survives a restart. */
function commitTimeline(ctx: Ctx, setS: Setter, next: SelState): void {
  setS(next);
  saveUndoSave(next.undo, next.undoBase, ctx.root.current?.name ?? "");
}

function selectedVisible(ctx: Ctx): string[] {
  const s = ctx.state.current;
  const visibleIds = new Set(sortPairs(applyFilters(s.pairs, s.filter), s.sort).map((v) => v.pairId));
  return s.selectedIds.filter((id) => visibleIds.has(id));
}

/** Undo/redo one step; decisions steps persist like any other change. */
function stepHistory(ctx: Ctx, setS: Setter, dir: "undo" | "redo"): void {
  const s = ctx.state.current;
  const res = dir === "undo" ? undoOnce(s.undo) : redoOnce(s.undo);
  if (!res.out) return;
  const next = applyUndoOut({ ...s, undo: res.stack }, res.out);
  commitTimeline(ctx, setS, next);
  if (res.out.kind === "decisions") void persist(ctx, setS, next);
}

/** One decision over the selected *visible* pairs; one save, one summary. */
function bulk(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void, d: Decision): void {
  const s = ctx.state.current;
  const visibleIds = new Set(sortPairs(applyFilters(s.pairs, s.filter), s.sort).map((v) => v.pairId));
  const affected = s.selectedIds.filter((id) => visibleIds.has(id));
  if (affected.length === 0) return;
  const decided = bulkDecide(s, affected, d, new Date().toISOString());
  const next = pushUndo(decided, "decisions", decided.records);
  commitTimeline(ctx, setS, next);
  say(`${d === "approved" ? "Approved" : "Declined"} ${affected.length} pair${affected.length === 1 ? "" : "s"}`);
  void persist(ctx, setS, next);
}

/** V2 bulk: one transition, one write, ONE toast (spec V2 §6); also recorded
 * on the global timeline so it stays undoable like every other change. */
function decideBulk(ctx: Ctx, setS: Setter, ids: string[], d: Decision): void {
  const out = withBulkDecision(ctx.state.current, ids, d, new Date().toISOString());
  if (out.applied.length === 0) {
    setS(out.state);
    return nothingApplied(setS, out, d); // honest no-op, never a fake success
  }
  const next = pushUndo(out.state, "decisions", out.state.records);
  commitTimeline(ctx, setS, next);
  void reportBulk(ctx, setS, { state: next, out }, d);
}

function nothingApplied(setS: Setter, out: BulkOut, d: Decision): void {
  const msg = bulkMessage({ decision: d, applied: 0, skipped: out.skipped.length, saved: true });
  setS((p) => ({ ...p, toast: { msg, err: true } }));
}

interface BulkJob { state: SelState; out: BulkOut }

async function reportBulk(ctx: Ctx, setS: Setter, job: BulkJob, d: Decision): Promise<void> {
  const saved = await persist(ctx, setS, job.state);
  const msg = bulkMessage({ decision: d, applied: job.out.applied.length, skipped: job.out.skipped.length, saved });
  setS((p) => ({ ...p, toast: { msg, err: !saved } }));
}

function move(ctx: Ctx, setS: Setter, dir: 1 | -1): void {
  const s = ctx.state.current;
  const visibleIds = sortPairs(applyFilters(s.pairs, s.filter), s.sort).map((v) => v.pairId);
  setS((p) => moveActive(p, visibleIds, dir));
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
