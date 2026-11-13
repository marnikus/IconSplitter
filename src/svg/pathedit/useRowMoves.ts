// useRowMoves.ts — the edit mode's way to the previous / next row and out
// (2026-11-06; own hook 2026-11-10): nothing changed → go at once; changes → ask
// Save / Discard / Stay; Ctrl+Shift+S saves, approves and goes; Finish hands
// the rewritten file to the caller. `markup` is the file text as the session
// would write it now, or null when nothing changed.

import { useCallback, useState } from "react";
import type { EditNav } from "./useEditMode";

export type GoMode = "ask" | "save" | "discard" | "save-approve";

export interface RowMoves {
  /** A move asked while something changed: Save / Discard / Stay. */
  leave: 1 | -1 | null;
  resolveLeave: (choice: "save" | "discard" | "stay") => void;
  go: (dir: 1 | -1, mode: GoMode) => void;
  finish: () => void;
}

export function useRowMoves(a: { nav?: EditNav; onFinish: (markup: string) => void }, markup: () => string | null): RowMoves {
  const [leave, setLeave] = useState<1 | -1 | null>(null);
  const go = useCallback((dir: 1 | -1, mode: GoMode) => {
    const nav = a.nav;
    if (nav === undefined || !(dir === 1 ? nav.canNext : nav.canPrev)) return;
    const out = markup();
    if (mode === "save-approve") { nav.onGo(dir, out, true); return; } // approves even with nothing to save
    if (out === null || mode === "discard") nav.onGo(dir, null);
    else if (mode === "save") nav.onGo(dir, out);
    else setLeave(dir);
  }, [a.nav, markup]);
  const finish = useCallback(() => { const out = markup(); if (out !== null) a.onFinish(out); }, [markup, a]);
  const resolveLeave = useCallback((choice: "save" | "discard" | "stay") => {
    const dir = leave;
    setLeave(null);
    if (dir !== null && choice !== "stay") go(dir, choice);
  }, [leave, go]);
  return { leave, resolveLeave, go, finish };
}
