// Subscribe to checks only when they affect ordering. Ordinary sorting keeps
// its visible-array identity and indexed selection-projection performance.
import { useSyncExternalStore } from "react";
import { getAppState, subscribe } from "./appstore";

const EMPTY_CHECKS: readonly string[] = [];

export function useSortChecks(tab: "batch" | "v2", enabled: boolean): readonly string[] {
  const snapshot = () => enabled ? getAppState()[tab].checked : EMPTY_CHECKS;
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
