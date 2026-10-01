// appstore.ts — the one store above the tabs (RULE 12; design doc §2).
//
// Workbench renders exactly one panel at a time, so anything a global undo/redo
// or a restart must see cannot live in panel-local useState: it is destroyed on
// every tab switch, which is why a change made in one tab could not be undone
// from another. This module-scope store is the owner instead. It is
// deliberately React-free — useAppState binds it with useSyncExternalStore — so
// the rules stay testable without a DOM (RULE 5).

import { DEFAULT_PREFS, type ReviewPrefs } from "../lib/reviewprefs";
import {
  DEFAULT_SESSION, type SessionSelection, type SessionState, type SessionV2, type TabId,
} from "../lib/session";

export interface AppState {
  tab: TabId;
  sheets: SheetOptsState;
  /** Review view state shared by the Selection and Selection V2 tabs. */
  view: SessionSelection;
  /** What only the V2 layout adds on top of that. */
  v2: SessionV2;
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
    view: session.selection, v2: session.selectionV2, prefs,
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

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Install a state wholesale: the restore path, and test isolation. */
export function resetAppStore(next: AppState = initialAppState(DEFAULT_SESSION, DEFAULT_PREFS)): void {
  state = next;
  notify();
}

/** The restart projection. Prefs stay out — prefsstore already owns them. */
export function sessionOf(s: AppState): SessionState {
  return { tab: s.tab, sheets: s.sheets, selection: s.view, selectionV2: s.v2 };
}

function notify(): void {
  for (const listener of listeners) listener();
}
