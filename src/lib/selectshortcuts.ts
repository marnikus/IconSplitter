// selectshortcuts.ts — reusable A/E select/deselect all for any row list (RULE 3)
// Handles focus (text fields are ignored) and modifier keys so browser Ctrl+A
// keeps working. One owner per tab calls the hook; the implementation stays
// free of React so the key mapping is testable.

import { isTextField } from "../selection/hotkeys";

export interface SelectAllTarget {
  selectVisible: () => void;
  deselectAll: () => void;
}

/**
 * Pure key handler — returns true when the key was handled.
 * A selects all visible (or all if no filter), E deselects all.
 * Case-insensitive, ignores Ctrl/Meta/Alt and text entry surfaces.
 */
export function handleSelectShortcut(e: KeyboardEvent, t: SelectAllTarget): boolean {
  if (isTextField(e.target)) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (k === "a") {
    t.selectVisible();
    return true;
  }
  if (k === "e") {
    t.deselectAll();
    return true;
  }
  return false;
}

/**
 * React hook that wires A/E to the current tab's select-all targets.
 * The callbacks are stable via refs so the listener does not re-bind on every
 * render, yet always calls the latest implementation.
 */
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
