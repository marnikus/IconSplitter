// useLog.ts — binds the dock to the store. The store is module state that no
// unmount can lose (L-7); React reads it with useSyncExternalStore, so a render
// can never see half an append and the snapshot identity says "nothing changed".

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getLog, subscribeLog, type LogSnapshot } from "./logstore";

export const useLog = (): LogSnapshot => useSyncExternalStore(subscribeLog, getLog, getLog);

/**
 * Text for a live region that changes at most once per `ms`, so a screen reader
 * is not flooded by a burst: the first change after a quiet spell is immediate,
 * later ones wait and then show the LATEST value (log-panel.md §6).
 */
export function useThrottled(value: string, ms = 1000): string {
  const [shown, setShown] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    if (value === shown) return;
    const show = () => {
      last.current = Date.now();
      setShown(value);
    };
    const wait = last.current + ms - Date.now();
    if (wait <= 0) return show();
    const timer = window.setTimeout(show, wait);
    return () => window.clearTimeout(timer);
  }, [value, shown, ms]);
  return shown;
}
