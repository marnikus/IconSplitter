// useLog.ts — the React binding for the log store. Snapshots are the objects
// the store already holds, so useSyncExternalStore sees a new reference only
// when the log really changed (the appstore pattern, RULE 24).

import { useSyncExternalStore } from "react";
import { getLogState, subscribeLog, type LogState } from "./logstore";

export function useLog(): LogState {
  return useSyncExternalStore(subscribeLog, getLogState, getLogState);
}
