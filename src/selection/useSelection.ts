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
import { loadDecisions, saveDecisions } from "./reviewstore";
import {
  applyScan, initialSelState, nextPendingId, withDecision, type SelState,
} from "./state";

const HANDLE_KEY = "__selection__";
const WATCH_MS = 30_000;

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
  const say = useCallback((msg: string, err = false) => setS((p) => ({ ...p, toast: { msg, err } })), []);
  return {
    s, visible, say, supported: fsSupported(), rootRef: ctx.root,
    chooseRoot: useCallback(() => chooseRoot(ctx, setS, say), [ctx, setS, say]),
    rescan: useCallback(() => rescan(ctx, setS, say), [ctx, setS, say]),
    decide: useCallback((id: string, d: Decision) => decide(ctx, setS, id, d), [ctx, setS]),
    retryWrite: useCallback(() => retryWrite(ctx, setS), [ctx, setS]),
    select: useCallback((id: string) => setS((p) => ({ ...p, selectedId: id })), []),
    setFilter: useCallback((f: ListFilter) => setS((p) => ({ ...p, filter: f })), []),
    setSort: useCallback((so: SortState) => setS((p) => ({ ...p, sort: so })), []),
    patch: useCallback((part: Partial<SelState>) => setS((p) => ({ ...p, ...part })), []),
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
  await rescan(ctx, setS, () => undefined);
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

export async function rescan(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void): Promise<void> {
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
  const rolled = merged.autoNext ? nextPendingId(merged.pairs, id) : null;
  const next = rolled ? { ...merged, selectedId: rolled } : merged;
  setS(next);
  void persist(ctx, setS, next);
}

async function persist(ctx: Ctx, setS: Setter, s: SelState): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  try {
    await saveDecisions(root, s.records);
    setS((p) => ({ ...p, writeWarn: null, awaitingRetry: 0 }));
  } catch {
    setS((p) => ({
      ...p, writeWarn: "Decision file could not be written. Your pending change is retained in memory.",
      awaitingRetry: p.awaitingRetry + 1,
    }));
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
