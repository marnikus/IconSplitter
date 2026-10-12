// selectshortcuts.ts — reusable Q/E select/deselect all for any row list (RULE 3)
// Q deselects all, E selects all visible (or all if no filter). A approve, D decline stay separate.
// Handles focus (text fields ignored) and modifiers so browser Ctrl+A keeps working.

import { isTextField } from "../selection/hotkeys";
import type { CheckState } from "./reviewselect";

export interface SelectAllTarget {
  selectVisible: () => void;
  deselectAll: () => void;
  header?: CheckState;
  checkedCount?: number;
  visibleCount?: number;
}

/**
 * Pure key handler — returns true when handled.
 * E selects visible, Q deselects all. A/D are approve/decline elsewhere.
 */
export function handleSelectShortcut(e: KeyboardEvent, t: SelectAllTarget): boolean {
  if (isTextField(e.target)) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (k === "e") {
    t.selectVisible();
    return true;
  }
  if (k === "q") {
    t.deselectAll();
    return true;
  }
  return false;
}

import { useEffect, useRef } from "react";

export function useSelectShortcuts(target: SelectAllTarget, enabled = true): void {
  const ref = useRef(target);
  ref.current = target;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      handleSelectShortcut(e, ref.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
