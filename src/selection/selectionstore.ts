// selectionstore.ts — the ONE review state (RULE 10/24, request §9). Not React
// state: a module store, so a hidden tab cannot hold a stale copy, and an undo
// applier can mutate the review from any tab. Commands live in
// `selectioncommands.ts`; this file owns the state, the rescan transition and
// decision-file persistence (via a writer the hook installs).

import { createStore, type Store } from "../store/store";
import { DEFAULT_PREFS } from "../lib/reviewprefs";
import type { ReviewSession } from "../lib/session";
import type { ReviewPair } from "../lib/pairing";
import type { ReviewRecord } from "../lib/reviewfile";
import { getSession } from "../session/sessionstore";
import {
  applyScan, initialSelState, withChecked, withDecisionStates, withViewPatch,
  type ScanLoad, type SelState, type ViewPatch,
} from "./state";

export type DecisionWriter = (records: ReviewRecord[]) => Promise<void>;

/** The store object itself, for `useStore` (components never copy state). */
export const selStore: Store<SelState> = createStore<SelState>(seedFromSession());
const store = selStore;
let writer: DecisionWriter | null = null;

export function getSelState(): SelState {
  return store.get();
}

export function subscribeSel(listener: () => void): () => void {
  return store.subscribe(listener);
}

/** Low-level single write; commands use `commitSel` so history stays in sync. */
export function setSel(next: SelState): void {
  store.set(() => next);
}

export function mutSel(fn: (prev: SelState) => SelState): void {
  store.set(fn);
}

/** Restored view state for the review surfaces (request §1). */
function seedFromSession(): SelState {
  const review = getSession().review;
  if (!review) return initialSelState();
  return initialSelState(seedPatch(review));
}

function seedPatch(r: ReviewSession): Partial<SelState> {
  return {
    filter: r.filter, sort: r.sort, checked: [...r.checked], selectedId: r.selectedId,
    prefs: { ...r.prefs }, watcher: r.watcher, collapsed: r.collapsed, zoom: r.zoom,
    sync: r.sync, autoNext: r.autoNext,
  };
}

export interface ScanOutcome {
  droppedSelections: number; // restored/checked ids the scan proves gone (request §1)
}

/** Rescan result → new state; carries decisions, diffs, prunes stale ids. */
export function scanState(scanned: ReviewPair[], load: ScanLoad, now: number): ScanOutcome {
  const prev = store.get();
  const next = applyScan(prev, scanned, load, now);
  const known = new Set(scanned.map((p) => p.pairId));
  const checked = next.checked.filter((id) => known.has(id));
  const selectedId = next.selectedId && known.has(next.selectedId) ? next.selectedId : next.selectedId;
  const dropped = (prev.checked.length - checked.length)
    + (prev.selectedId !== null && !known.has(prev.selectedId) ? 1 : 0);
  setSel({ ...next, checked, selectedId });
  return { droppedSelections: dropped };
}

/** Applies a view patch without history (used by commands and by undo replay). */
export function applyViewPatch(patch: ViewPatch): void {
  store.set((prev) => withViewPatch(prev, patch));
}

export function applyChecked(checked: readonly string[]): void {
  store.set((prev) => withChecked(prev, checked));
}

/**
 * Replay path for Undo/Redo: one atomic transition, no history entry, but the
 * SAME persistence a click triggers — an undo that is not written back would
 * resurrect the decision on the next scan.
 */
export function applyDecisionStates(states: Parameters<typeof withDecisionStates>[1]): number {
  const out = withDecisionStates(store.get(), states);
  if (out.changed === 0) return 0;
  store.set(() => out.state);
  void flushDecisions();
  return out.changed;
}

export function setDecisionWriter(w: DecisionWriter | null): void {
  writer = w;
}

/** Releases a writer only if it is still the installed one (parallel mounts). */
export function clearDecisionWriter(w: DecisionWriter): void {
  if (writer === w) writer = null;
}

/** Writes the decision file; false when memory and disk disagree. */
export async function flushDecisions(): Promise<boolean> {
  const records = store.get().records;
  if (!writer) return true; // no root yet: in-memory review only
  try {
    await writer(records);
    mutSel((p) => (p.writeWarn === null && p.awaitingRetry === 0 ? p : { ...p, writeWarn: null, awaitingRetry: 0 }));
    return true;
  } catch {
    mutSel((p) => ({ ...p, writeWarn: WRITE_WARN, awaitingRetry: p.awaitingRetry + 1 }));
    return false;
  }
}

export async function retryDecisionWrite(): Promise<boolean> {
  return flushDecisions();
}

export const WRITE_WARN = "Decision file could not be written. Your pending change is retained in memory.";

/** Test hook: back to defaults with no writer (module singleton isolation). */
export function resetSelectionStoreForTests(): void {
  writer = null;
  store.set(() => initialSelState({ prefs: { ...DEFAULT_PREFS } }));
}

export function sessionSeedForTests(): SelState {
  return seedFromSession();
}
