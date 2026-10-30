// HistoryProvider.tsx — the ONE global undo/redo timeline (RULE 12), mounted
// above every panel so an undo pressed on the Sheets tab can still reverse an
// approve made on Selection V2.
//
// The reducer rules live in lib/history (pure, unit-tested); this file owns only
// what a component must: the clock and ids on each entry, the keyboard
// shortcuts, persistence, and the rule that a failed apply leaves the cursor
// exactly where it was (design doc §4).

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import {
  canRedo as redoable, canUndo as undoable, COALESCE_MS, HISTORY_VERSION,
  pushCoalesced as coalesce, pushEntry, redoLabel as nextRedoLabel, stepForward,
  undoLabel as nextUndoLabel, stepBack, type HistoryEntry, type Timeline,
} from "../lib/history";
import { log } from "../log/logstore";
import { isTextField } from "../selection/hotkeys";
import { applyEntry } from "./apply";
import { flushHistory, loadHistory, scheduleSaveHistory } from "./historystore";

/** An action as the caller knows it; id/timestamp/version are added here. */
export type NewEntry = Omit<HistoryEntry, "id" | "at" | "v">;

/** What a panel needs to RECORD work. Stable across timeline changes. */
export interface HistoryActions {
  push: (entry: NewEntry) => void;
  /** One entry per gesture: slider drags collapse while the control keeps moving. */
  pushGesture: (entry: NewEntry) => void;
  undo: () => void;
  redo: () => void;
}

export interface HistoryApi extends HistoryActions {
  canUndo: boolean;
  canRedo: boolean;
  /** "Approve 14 selected pairs" — the action the next undo would reverse. */
  undoLabel: string | null;
  redoLabel: string | null;
  entries: HistoryEntry[];
  index: number;
  /** Set when an undo/redo could not be applied; the cursor did not move. */
  error: string | null;
}

const APPLY_FAILED = "That change could not be reversed — nothing was modified.";

// Two contexts on purpose. Recording a change must not re-render the recorder:
// `useHistoryActions` never changes identity, so a checkbox in one tab cannot
// wake a panel in another just because a timeline entry appeared. Only the
// history bar/panel subscribes to the view (entries, cursor, labels, error).
const ActionsCtx = createContext<HistoryActions | null>(null);
const ViewCtx = createContext<HistoryView | null>(null);

export interface HistoryView {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  entries: HistoryEntry[];
  index: number;
  error: string | null;
}

export function useHistoryActions(): HistoryActions {
  const api = useContext(ActionsCtx);
  if (!api) throw new Error("useHistoryActions must be used inside <HistoryProvider>");
  return api;
}

export function useHistoryView(): HistoryView {
  const view = useContext(ViewCtx);
  if (!view) throw new Error("useHistoryView must be used inside <HistoryProvider>");
  return view;
}

/** The combined surface: for the history bar/panel, tests and harnesses. */
export function useHistory(): HistoryApi {
  const view = useHistoryView();
  const actions = useHistoryActions();
  return { ...view, ...actions };
}

export function useOptionalHistory(): HistoryActions | null {
  return useContext(ActionsCtx);
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const store = useTimeline();
  const { undo, redo } = useApply(store.ref, store.commit, store.setError);
  const actions = useMemo<HistoryActions>(() => ({
    push: store.push, pushGesture: store.pushGesture, undo, redo,
  }), [store.push, store.pushGesture, undo, redo]);
  const view = useMemo<HistoryView>(() => ({
    canUndo: undoable(store.timeline), canRedo: redoable(store.timeline),
    undoLabel: nextUndoLabel(store.timeline), redoLabel: nextRedoLabel(store.timeline),
    entries: store.timeline.entries, index: store.timeline.index, error: store.error,
  }), [store.timeline, store.error]);
  return (
    <ActionsCtx.Provider value={actions}>
      <ViewCtx.Provider value={view}>{children}</ViewCtx.Provider>
    </ActionsCtx.Provider>
  );
}

interface TimelineStore {
  timeline: Timeline;
  error: string | null;
  ref: { current: Timeline };
  commit: (next: Timeline) => void;
  setError: (msg: string | null) => void;
  push: (entry: NewEntry) => void;
  pushGesture: (entry: NewEntry) => void;
}

function useTimeline(): TimelineStore {
  const [timeline, setTimeline] = useState<Timeline>(loadHistory);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(timeline);
  ref.current = timeline; // render mirror, so async callbacks read live state (RULE 24)
  const commit = useCallback((next: Timeline) => {
    ref.current = next; // two pushes in one tick must build on each other, not on the last render
    setTimeline(next);
    scheduleSaveHistory(next); // deferred: the gesture never serializes the timeline
  }, []);
  useFlushOnUnload();
  const record = useCallback((entry: NewEntry, gesture: boolean) => {
    setError(null);
    // Every state change is visible in the global log, one line per gesture.
    log({
      level: "debug", feature: "history", action: gesture ? "push-gesture" : "push",
      ids: targetIds(entry.ids), detail: entry.label, data: { type: entry.type, ids: entry.ids.length },
    });
    commit(gesture ? coalesce(ref.current, stamp(entry), Date.now(), COALESCE_MS) : pushEntry(ref.current, stamp(entry)));
  }, [commit]);
  return {
    timeline, error, ref, commit, setError,
    push: useCallback((entry: NewEntry) => record(entry, false), [record]),
    pushGesture: useCallback((entry: NewEntry) => record(entry, true), [record]),
  };
}

/** Leave nothing behind: pagehide flushes a pending write, and so does unmount. */
function useFlushOnUnload(): void {
  useEffect(() => {
    const flush = () => flushHistory();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flushHistory();
    };
  }, []);
}

/** Runs one direction; a failed apply reports and leaves the cursor alone. */
function useApply(ref: { current: Timeline }, commit: (next: Timeline) => void, setError: (m: string | null) => void) {
  const busy = useRef(false);
  const run = useCallback(async (dir: "undo" | "redo") => {
    if (busy.current) return; // one apply at a time; a second click must not race it
    const step = dir === "undo" ? stepBack(ref.current) : stepForward(ref.current);
    if (!step.entry) return;
    busy.current = true;
    log({ feature: "history", action: dir, ids: targetIds(step.entry.ids), detail: step.entry.label, data: { type: step.entry.type } });
    const ok = await applyEntry(step.entry, dir === "undo" ? step.entry.before : step.entry.after);
    busy.current = false;
    if (!ok) {
      // cursor untouched: the timeline stays consistent, and the log says why
      setError(APPLY_FAILED);
      log({ level: "error", feature: "history", action: "apply-failed", detail: APPLY_FAILED, data: { type: step.entry.type } });
      return;
    }
    setError(null);
    commit(step.timeline);
  }, [commit, ref, setError]);
  useHotkeys(run);
  return {
    undo: useCallback(() => { void run("undo"); }, [run]),
    redo: useCallback(() => { void run("redo"); }, [run]),
  };
}

function useHotkeys(run: (dir: "undo" | "redo") => Promise<void>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTextField(e.target)) return;
      const key = e.key.toLowerCase();
      const wantsUndo = key === "z" && !e.shiftKey;
      const wantsRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!wantsUndo && !wantsRedo) return;
      e.preventDefault(); // never let the browser undo a text field we do not own
      void run(wantsUndo ? "undo" : "redo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);
}

/** The one id a log entry may name, so a bulk edit never dumps a whole list. */
function targetIds(ids: string[]): Record<string, string> {
  return ids.length === 1 ? { target: ids[0] } : {};
}

let seq = 0;

/** Unique per action, stable once created, never a row index (I-10). */
function stamp(entry: NewEntry): HistoryEntry {
  seq += 1;
  return { ...entry, id: `h${Date.now().toString(36)}-${seq}`, at: new Date().toISOString(), v: HISTORY_VERSION };
}
