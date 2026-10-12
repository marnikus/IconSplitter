// useBatchHotkeys.ts — Batch folders hotkeys: ↑/↓ moves active, E selects visible, Q deselects all

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
      if (handleSelectShortcut(e, {
        selectVisible: () => ref.current.checkVisible(),
        deselectAll: () => ref.current.uncheckAll(),
        header: ref.current.header,
        checkedCount: ref.current.checkedCount,
        visibleCount: ref.current.visibleCount,
      })) {
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
