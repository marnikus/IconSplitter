// useAppState.ts — the React binding for the store above the tabs. Snapshots
// are the objects the store already holds, so useSyncExternalStore sees a new
// reference only when the matching slice really changed.

import { useSyncExternalStore } from "react";
import { getAppState, subscribe, type AppState } from "./appstore";

/** The whole app state — for panels that touch several slices (Sheets). */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getAppState, getAppState);
}

/** Just the shared review view slice, so a checkbox does not re-render a list. */
export function useAppView(): AppState["view"] {
  return useSyncExternalStore(subscribe, getView, getView);
}

function getView(): AppState["view"] {
  return getAppState().view;
}
