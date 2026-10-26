// appstore.ts — the one store above the tabs (RULE 12; design doc §2).
//
// Workbench renders exactly one panel at a time, so anything a global undo/redo
// or a restart must see cannot live in panel-local useState: it is destroyed on
// every tab switch, which is why a change made in one tab could not be undone
// from another. This module-scope store is the owner instead. It is
// deliberately React-free — useAppState binds it with useSyncExternalStore — so
// the rules stay testable without a DOM (RULE 5).

import { DEFAULT_PREFS, type ReviewPrefs } from "../lib/reviewprefs";
import { resetListTargets } from "./listtargets";
import {
  DEFAULT_SESSION, type SessionBatch, type SessionSelection, type SessionState, type SessionSvg, type SessionUpload, type SessionV2, type TabId,
} from "../lib/session";

export interface AppState {
  tab: TabId;
  sheets: SheetOptsState;
  /** Selection V2 review state, persisted in the compatible selection JSON slice. */
  view: SessionSelection;
  /** Selection V2 checkbox and scroll state. */
  v2: SessionV2;
  /** Generate SVG tab: its own checkbox selection (stable source ids). */
  svg: SessionSvg;
  /** SVG to upload tab: its own checkbox selection (stable pair ids). */
  upload: SessionUpload;
  /** Batch folders tab: its own selection, active row and anchor. */
  batch: SessionBatch;
  /** Held in memory only — selectionv2/prefsstore is its single writer. */
  prefs: ReviewPrefs;
}

type SheetOptsState = SessionState["sheets"];
type Listener = () => void;

let state: AppState = initialAppState(DEFAULT_SESSION, DEFAULT_PREFS);
const listeners = new Set<Listener>();

export function initialAppState(session: SessionState, prefs: ReviewPrefs): AppState {
  return {
    tab: session.tab, sheets: session.sheets,
    view: session.selection, v2: session.selectionV2, svg: session.svg, upload: session.upload, batch: session.batch, prefs,
  };
}

export function getAppState(): AppState {
  return state;
}

export function setAppState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  notify();
}

export function patchView(patch: Partial<SessionSelection>): void {
  setAppState({ view: { ...state.view, ...patch } });
}

export function patchV2(patch: Partial<SessionV2>): void {
  setAppState({ v2: { ...state.v2, ...patch } });
}

/** A V2 selection gesture: checked + anchor live in `v2`, the active row in `view`. */
export interface V2SelectionPatch {
  checked?: string[];
  anchorId?: string | null;
  activeId?: string | null;
}

/**
 * ONE store notification for a whole gesture. V2 keeps its active row in the
 * shared `view` slice, so the old path wrote `v2` and then `view` (two
 * notifications, and a needless `v2` rewrite for an active-only move).
 */
export function patchV2Selection(p: V2SelectionPatch): void {
  const v2: SessionV2 = { ...state.v2 };
  if (p.checked !== undefined) v2.checked = p.checked;
  if (p.anchorId !== undefined) v2.anchorId = p.anchorId;
  const nextActive = p.activeId === undefined ? state.view.selectedId : p.activeId;
  const view = nextActive === state.view.selectedId ? state.view : { ...state.view, selectedId: nextActive };
  state = { ...state, v2, view };
  notify();
}

export function patchSvg(patch: Partial<SessionSvg>): void {
  setAppState({ svg: { ...state.svg, ...patch } });
}

export function patchUpload(patch: Partial<SessionUpload>): void {
  setAppState({ upload: { ...state.upload, ...patch } });
}

export function patchBatch(patch: Partial<SessionBatch>): void {
  setAppState({ batch: { ...state.batch, ...patch } });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Install a state wholesale: the restore path, and test isolation. */
export function resetAppStore(next: AppState = initialAppState(DEFAULT_SESSION, DEFAULT_PREFS)): void {
  state = next;
  resetListTargets();
  notify();
}

/** The restart projection. Prefs stay out — prefsstore already owns them. */
export function sessionOf(s: AppState): SessionState {
  return { tab: s.tab, sheets: s.sheets, selection: s.view, selectionV2: s.v2, svg: s.svg, upload: s.upload, batch: s.batch };
}

function notify(): void {
  for (const listener of listeners) listener();
}
