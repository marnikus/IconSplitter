// useToast.ts — the transient status line of a tab (RULE 2: every action says
// what happened). One message at a time: the newest replaces the old one and
// restarts the clock, and a message never outlives its tab.

import { useCallback, useEffect, useRef, useState } from "react";

export interface Toast {
  msg: string;
  err?: boolean;
}

export interface ToastApi {
  toast: Toast | null;
  say: (msg: string, err?: boolean) => void;
}

export function useToast(ms = 3200): ToastApi {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(0);
  const say = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), ms);
  }, [ms]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { toast, say };
}
