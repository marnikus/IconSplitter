// useSelection.ts — UI orchestration for Selection review (RULE 2/4/5/24).
// Thin by design: discovery, decisions, filters, checks, prefs and their
// persistence live in the module store (`selectionstore.ts` + `selectioncommands.ts`)
// so both Selection surfaces and the global Undo timeline share ONE state and
// one mutation path. This hook only wires IO (handles, rescan, watcher, file
// writes) and derived lists onto that store.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { readDirTree, type DirHandleLike } from "../lib/fs";
import { walkTree } from "../lib/scan";
import { pairEntries } from "../lib/pairing";
import { applyFilters, type Decision, type ListFilter } from "../lib/reviewfilter";
import { sortPairs, type SortState } from "../lib/reviewsort";
import { pickDirectory, fsSupported } from "../batch/picker";
import { loadHandles, saveHandles } from "../batch/store";
import { useStore } from "../store/store";
import { ensureSelectionMirror } from "../session/selectionmirror";
import { loadDecisions, saveDecisions } from "./reviewstore";
import { clearDecisionWriter, selStore, retryDecisionWrite, scanState, setDecisionWriter, type DecisionWriter } from "./selectionstore";
import {
  checkVisibleCommand, decideBulkCommand, decideCommand, patchCommand, resetCommand, sayCommand,
  selectCommand, setFilterCommand, setModeCommand, setSortCommand, setThumbCommand, setViewCommand,
  toggleCheckCommand, uncheckAllCommand,
} from "./selectioncommands";
import { coalesceOfView, splitPatch, viewPatchLabel } from "./viewpatch";
import type { SelState, ViewPatch } from "./state";
import "./selectionhistory"; // registers the review appliers on the global timeline

const HANDLE_KEY = "__selection__";
const WATCH_MS = 30_000;

interface Ctx {
  root: { current: DirHandleLike | null };
}

export function useSelection() {
  const s = useStore(selStore);
  const ctx = useCtx();
  useEffect(() => { void boot(ctx); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => installPersistence(ctx), [ctx]);
  useWatcher(ctx, s.watcher, s.rootName);
  useToastClear(s.toast);
  const visible = useMemo(() => sortPairs(applyFilters(s.pairs, s.filter), s.sort), [s.pairs, s.filter, s.sort]);
  const selectVisible = useCallback(() => checkVisibleCommand(visible.map((p) => p.pairId)), [visible]);
  return {
    s, visible, supported: fsSupported(), rootRef: ctx.root,
    say: useCallback((msg: string, err = false) => sayCommand(msg, err), []),
    chooseRoot: useCallback(() => chooseRoot(ctx), [ctx]),
    rescan: useCallback(() => rescan(ctx), [ctx]),
    decide: useCallback((id: string, d: Decision) => decideCommand(id, d, new Date().toISOString()), []),
    decideBulk: useCallback((ids: string[], d: Decision) => decideBulkCommand(ids, d, new Date().toISOString()), []),
    reset: useCallback((ids: string[]) => resetCommand(ids), []),
    retryWrite: useCallback(async () => { await retryDecisionWrite(); }, []),
    select: useCallback((id: string) => selectCommand(id), []),
    setFilter: useCallback((f: ListFilter) => setFilterCommand(f), []),
    setSort: useCallback((so: SortState) => setSortCommand(so), []),
    setMode: useCallback((m: "list" | "compare") => setModeCommand(m), []),
    setThumb: useCallback((px: number) => setThumbCommand(px), []),
    setView: useCallback((patch: ViewPatch, label: string, coalesce?: string) => setViewCommand(patch, label, coalesce), []),
    patch: useCallback((part: Partial<SelState>) => patchSel(part), []),
    toggleCheck: useCallback((id: string) => toggleCheckCommand(id), []),
    checkVisible: selectVisible,
    uncheckAll: useCallback(() => uncheckAllCommand(), []),
  };
}

/** One entry point for a whole value: view fields are undoable, reporting is not. */
function patchSel(part: Partial<SelState>): void {
  const { view, rest } = splitPatch(part);
  if (Object.keys(rest).length > 0) patchCommand(rest);
  if (Object.keys(view).length > 0) setViewCommand(view, viewPatchLabel(view), coalesceOfView(view));
}

function useCtx(): Ctx {
  const root = useRef<DirHandleLike | null>(null);
  return useMemo(() => ({ root }), [root]);
}

/** Session mirror + decision-file writer for the lifetime of the mount. */
function installPersistence(ctx: Ctx): () => void {
  ensureSelectionMirror();
  const write: DecisionWriter = async (records) => {
    const root = ctx.root.current;
    if (!root) return; // no root yet: in-memory review only
    await saveDecisions(root, records);
  };
  setDecisionWriter(write);
  return () => clearDecisionWriter(write);
}

/** Boot: reopen the remembered root (permission may be re-requested). */
async function boot(ctx: Ctx): Promise<void> {
  const stored = await loadHandles(HANDLE_KEY);
  if (!stored?.source) return;
  ctx.root.current = stored.source;
  patchCommand({ rootName: stored.source.name });
  await rescan(ctx);
}

async function chooseRoot(ctx: Ctx): Promise<void> {
  const h = await pickDirectory();
  if (!h) return sayCommand("Folder picking needs Chrome or Edge — or was cancelled", true);
  ctx.root.current = h;
  patchCommand({ rootName: h.name });
  void saveHandles(HANDLE_KEY, { source: h });
  await rescan(ctx);
}

async function rescan(ctx: Ctx): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  patchCommand({ busy: "Scanning folders…" });
  try {
    const tree = await readDirTree(root, []);
    const pairs = pairEntries(walkTree(tree, []));
    const load = await loadDecisions(root);
    const outcome = scanState(pairs, load, Date.now());
    reportScan(load, outcome.droppedSelections);
  } catch {
    sayCommand("Rescan failed — the folder may be unreadable", true);
  } finally {
    patchCommand({ busy: null });
  }
}

/** Honest notes after a scan: stale restored selections, corrupt decision file. */
function reportScan(load: { corrupt: boolean }, dropped: number): void {
  if (dropped > 0) {
    sayCommand(`${dropped} restored selection${dropped === 1 ? "" : "s"} no longer exist in this folder`, true);
  }
  if (load.corrupt) sayCommand("review-decisions.json is corrupt — kept previous decisions in memory", true);
}

function useWatcher(ctx: Ctx, on: boolean, rootName: string): void {
  useEffect(() => {
    if (!on || !rootName) return;
    const t = setInterval(() => { void rescan(ctx); }, WATCH_MS);
    return () => clearInterval(t);
  }, [on, rootName, ctx]);
}

function useToastClear(toast: SelState["toast"]): void {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => patchCommand({ toast: null }), 4000);
    return () => clearTimeout(t);
  }, [toast]);
}

export type SelectionApi = ReturnType<typeof useSelection>;
