// useHistory.ts — the React face of the global timeline (request §6/§9).
// One subscription to the bus; components never keep their own copy.

import { useSyncExternalStore } from "react";
import {
  getHistorySnapshot, redo as runRedo, subscribeHistory, undo as runUndo,
  type HistorySnapshot,
} from "./historybus";

export interface HistoryApi extends HistorySnapshot {
  undo: () => void;
  redo: () => void;
}

export function useHistory(): HistoryApi {
  const snapshot = useSyncExternalStore(subscribeHistory, getHistorySnapshot, getHistorySnapshot);
  return { ...snapshot, undo: runUndo, redo: runRedo };
}

export { canRedo, canUndo, redoLabel, undoLabel } from "../lib/history";
