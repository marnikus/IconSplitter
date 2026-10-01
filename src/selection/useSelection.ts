// useSelection.ts — UI orchestration for Selection review (RULE 2/4/5/24).
// Thin: every rule lives in tested pure modules (state.ts, reviewselect.ts,
// reviewthumb.ts, reviewbulk.ts, reviewstore.ts, pairing/scan/fs). Keeps a
// render-mirror Ctx like useBatch so async callbacks read live state; every
// decision change persists with exactly one write per logical operation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readDirTree, type DirHandleLike } from "../lib/fs";
import { walkTree } from "../lib/scan";
import { pairEntries } from "../lib/pairing";
import { applyFilters, type Decision, type ListFilter, type ViewPair } from "../lib/reviewfilter";
import { sortPairs, type SortState } from "../lib/reviewsort";
import { bulkResultText, type Verdict } from "../lib/reviewbulk";
import { headerCheck, hiddenIds, toggleId, unionIds } from "../lib/reviewselect";
import { readThumbH, writeThumbH } from "../lib/reviewthumb";
import { pickDirectory, fsSupported } from "../batch/picker";
import { loadHandles, saveHandles } from "../batch/store";
import { loadDecisions, saveDecisions } from "./reviewstore";
import {
  applyScan, initialSelState, nextPendingId, withDecision, withDecisions,
  type SelState,
} from "./state";

const HANDLE_KEY = "__selection__";
const WATCH_MS = 30_000;

type Say = (msg: string, err?: boolean) => void;
type Setter = React.Dispatch<React.SetStateAction<SelState>>;

interface Ctx {
  root: { current: DirHandleLike | null };
  state: { current: SelState };
}

export interface BulkReq {
  ids: string[];
  verdict: Verdict;
}

export function useSelection() {
  const [s, setS] = useState(initState);
  const ctx = useCtx(s);
  useEffect(() => { void boot(ctx, setS); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useWatcher(ctx, s.watcher, s.rootName, setS);
  useToastClear(s.toast, setS);
  const visible = useMemo(() => sortPairs(applyFilters(s.pairs, s.filter), s.sort), [s.pairs, s.filter, s.sort]);
  const say = useCallback((msg: string, err = false) => setS((p) => ({ ...p, toast: { msg, err } })), []);
  return { s, visible, say, supported: fsSupported(), rootRef: ctx.root, ...useActions(ctx, setS, say, visible) };
}

function initState(): SelState {
  return { ...initialSelState(), thumbH: readThumbH(window.localStorage) };
}

function useCtx(s: SelState): Ctx {
  const stateRef = useRef(s);
  stateRef.current = s; // render-mirror for async callbacks (RULE 24)
  return { root: useRef(null), state: stateRef };
}

function useActions(ctx: Ctx, setS: Setter, say: Say, visible: ViewPair[]) {
  const visibleIds = useMemo(() => visible.map((p) => p.pairId), [visible]);
  return {
    chooseRoot: useCallback(() => chooseRoot(ctx, setS, say), [ctx, setS, say]),
    rescan: useCallback(() => rescan(ctx, setS, say), [ctx, setS, say]),
    decide: useCallback((id: string, d: Decision) => decide(ctx, setS, id, d), [ctx, setS]),
    retryWrite: useCallback(() => { void persistQuiet(ctx, setS, ctx.state.current); }, [ctx, setS]),
    activate: useCallback((id: string) => setS((p) => ({ ...p, activeId: id })), [setS]),
    toggleCheck: useCallback((id: string) => setS((p) => ({ ...p, checked: toggleId(p.checked, id) })), [setS]),
    checkAll: useCallback(() => setS((p) => ({ ...p, checked: unionIds(p.checked, visibleIds) })), [setS, visibleIds]),
    uncheckAll: useCallback(() => setS((p) => ({ ...p, checked: [] })), [setS]),
    headerToggle: useCallback(() => setS((p) => headerFlip(p, visibleIds)), [setS, visibleIds]),
    setFilter: useCallback((f: ListFilter) => setS((p) => ({ ...p, filter: f })), [setS]),
    setSort: useCallback((so: SortState) => setS((p) => ({ ...p, sort: so })), [setS]),
    setThumbH: useCallback((px: number) => setS((p) => ({ ...p, thumbH: writeThumbH(window.localStorage, px) })), [setS]),
    bulkDecide: useCallback((req: BulkReq) => { void bulkCommit(ctx, setS, say, req); }, [ctx, setS, say]),
    patch: useCallback((part: Partial<SelState>) => setS((p) => ({ ...p, ...part })), [setS]),
  };
}

/** Header checkbox flips the VISIBLE scope only (hidden checks survive). */
function headerFlip(s: SelState, visibleIds: string[]): SelState {
  return headerCheck(s.checked, visibleIds) === "unchecked"
    ? { ...s, checked: unionIds(s.checked, visibleIds) }
    : { ...s, checked: hiddenIds(s.checked, visibleIds) };
}

async function boot(ctx: Ctx, setS: Setter): Promise<void> {
  const stored = await loadHandles(HANDLE_KEY);
  const h = stored?.source ?? null;
  if (!h) return;
  setRoot(ctx, setS, h);
  await rescan(ctx, setS, () => undefined);
}

async function chooseRoot(ctx: Ctx, setS: Setter, say: Say): Promise<void> {
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

export async function rescan(ctx: Ctx, setS: Setter, say: Say): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  setS((p) => ({ ...p, busy: "Scanning folders…" }));
  try {
    const tree = await readDirTree(root, []);
    const pairs = pairEntries(walkTree(tree, []));
    const load = await loadDecisions(root);
    setS((p) => applyScan(p, pairs, load, Date.now()));
    if (load.corrupt) say("review-decisions.json is corrupt — kept previous decisions in memory", true);
  } catch {
    say("Rescan failed — the folder may be unreadable", true);
  } finally {
    setS((p) => ({ ...p, busy: null }));
  }
}

function decide(ctx: Ctx, setS: Setter, id: string, d: Decision): void {
  const merged = withDecision(ctx.state.current, id, d, new Date().toISOString());
  if (merged === ctx.state.current) return;
  const order = sortPairs(applyFilters(merged.pairs, merged.filter), merged.sort);
  const rolled = merged.autoNext ? nextPendingId(order, id) : null;
  const next = rolled ? { ...merged, activeId: rolled } : merged;
  setS(next);
  void persistQuiet(ctx, setS, next);
}

/** One logical bulk operation: all decisions in memory, ONE save, ONE report. */
async function bulkCommit(ctx: Ctx, setS: Setter, say: Say, req: BulkReq): Promise<void> {
  const out = withDecisions(ctx.state.current, req.ids, req.verdict, new Date().toISOString());
  if (out.applied === 0) {
    say("Nothing to apply — those rows are no longer listed", true);
    return;
  }
  setS(out.state);
  const saved = await persistQuiet(ctx, setS, out.state);
  say(bulkResultText(req.verdict, out.applied, out.skipped.length, saved), !saved);
}

/** Writes the decision file; false = change kept in memory with a warning. */
async function persistQuiet(ctx: Ctx, setS: Setter, s: SelState): Promise<boolean> {
  const root = ctx.root.current;
  if (!root) return false;
  try {
    await saveDecisions(root, s.records);
    setS((p) => ({ ...p, writeWarn: null, awaitingRetry: 0 }));
    return true;
  } catch {
    setS((p) => ({
      ...p,
      writeWarn: "Decision file could not be written. Your pending change is retained in memory.",
      awaitingRetry: p.awaitingRetry + 1,
    }));
    return false;
  }
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
