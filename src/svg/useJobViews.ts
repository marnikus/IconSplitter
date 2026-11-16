import { useCallback, useSyncExternalStore } from "react";
import { jobStore } from "./jobstate";
import type { SvgRefs } from "./types";

export function useJobViews(refs: SvgRefs) {
  const store = jobStore(refs);
  const subscribe = useCallback((listener: () => void) => {
    store.listeners.add(listener);
    return () => { store.listeners.delete(listener); };
  }, [store]);
  const snapshot = useCallback(() => store.views, [store]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
