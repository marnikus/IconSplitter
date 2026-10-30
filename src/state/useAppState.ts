// useAppState.ts — the React binding for the store above the tabs. Snapshots
// are the objects the store already holds, so useSyncExternalStore sees a new
// reference only when the matching slice really changed.

import { useSyncExternalStore } from "react";
import { getAppState, subscribe, type AppState } from "./appstore";

/** The whole app state — for panels that touch several slices (Sheets). */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getAppState, getAppState);
}

/**
 * One slice, one reason to re-render. `setAppState` replaces only the patched
 * slice, so a slice reference is stable under every unrelated patch and no
 * equality helper is needed. Panels read the slice they own instead of the whole
 * state; the Shell reads `tab` alone, so a selection gesture can never wake the
 * three hidden tabs (the reported "every tab freezes").
 */
const getters: { [K in keyof AppState]: () => AppState[K] } = {
  tab: (): AppState["tab"] => getAppState().tab,
  sheets: (): AppState["sheets"] => getAppState().sheets,
  view: (): AppState["view"] => getAppState().view,
  v2: (): AppState["v2"] => getAppState().v2,
  svg: (): AppState["svg"] => getAppState().svg,
  upload: (): AppState["upload"] => getAppState().upload,
  stockUpload: (): AppState["stockUpload"] => getAppState().stockUpload,
  batch: (): AppState["batch"] => getAppState().batch,
  prefs: (): AppState["prefs"] => getAppState().prefs,
};

export function useAppSlice<K extends keyof AppState>(key: K): AppState[K] {
  return useSyncExternalStore(subscribe, getters[key], getters[key]);
}

/** Just the shared review view slice, so a checkbox does not re-render a list. */
export function useAppView(): AppState["view"] {
  return useSyncExternalStore(subscribe, getters.view, getters.view);
}
