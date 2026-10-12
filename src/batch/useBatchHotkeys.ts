// useBatchHotkeys.ts — Batch folders hotkeys: ↑/↓ moves active row and scrolls into view without changing checks,
// A selects all visible, E deselects all. Reuses isTextField and selectshortcuts logic for A/E.
// One owner per tab, focus-aware, modifier-aware.

import { useEffect, useRef } from "react";
import { isTextField } from "../selection/hotkeys";
import { handleSelectShortcut } from "../lib/selectshortcuts";
import type { BatchSelection } from "./useBatchSelection";

export function useBatchHotkeys(sel: BatchSelection, enabled = true): void {
  const ref = useRef(sel);
  ref.current = sel;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTextField(e.target)) return;
      // A/E via reusable handler (ignores Ctrl/Meta/Alt)
      if (handleSelectShortcut(e, { selectVisible: () => ref.current.checkVisible(), deselectAll: () => ref.current.uncheckAll() })) {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        ref.current.moveActive(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        ref.current.moveActive(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
