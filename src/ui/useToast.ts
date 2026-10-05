// useToast.ts — the transient status line of a tab (RULE 2: every action says
// what happened). One message at a time: the newest replaces the old one and
// restarts the clock, and a message never outlives its tab. Every message is also
// mirrored 1:1 into the global log under the tab's feature (L-4), so what the
// user saw for a few seconds can be read back later.

import { useCallback, useEffect, useRef, useState } from "react";
import type { LogFeature } from "../lib/logentry";
import { logStatus } from "../log/logger";

export interface Toast {
  msg: string;
  err?: boolean;
}

export interface ToastApi {
  toast: Toast | null;
  say: (msg: string, err?: boolean) => void;
}

export function useToast(feature: LogFeature, ms = 3200): ToastApi {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(0);
  const say = useCallback((msg: string, err = false) => {
    logStatus(feature, msg, err);
    setToast({ msg, err });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), ms);
  }, [feature, ms]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { toast, say };
}
