// selectshortcuts.ts — reusable Q/E for the active row, with a no-active fallback.
// E selects visible when none is active; Q then deselects all, including hidden checks.

import { useEffect, useRef } from "react";
import { isTextField } from "../selection/hotkeys";

export interface SelectAllTarget {
  activeId?: string | null;
  selectActive?: () => void;
  deselectActive?: () => void;
  selectVisible?: () => void;
  deselectAll?: () => void;
}

function trySelectActive(t: SelectAllTarget): boolean {
  if (t.activeId && t.selectActive) {
    t.selectActive();
    return true;
  }
  return false;
}

function tryDeselectActive(t: SelectAllTarget): boolean {
  if (t.activeId && t.deselectActive) {
    t.deselectActive();
    return true;
  }
  return false;
}

function handleE(t: SelectAllTarget): boolean {
  if (trySelectActive(t)) return true;
  if (t.selectVisible) {
    t.selectVisible();
    return true;
  }
  return false;
}

function handleQ(t: SelectAllTarget): boolean {
  if (tryDeselectActive(t)) return true;
  if (t.deselectAll) {
    t.deselectAll();
    return true;
  }
  return false;
}

export function handleSelectShortcut(e: KeyboardEvent, t: SelectAllTarget): boolean {
  if (isTextField(e.target)) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (k === "e") return handleE(t);
  if (k === "q") return handleQ(t);
  return false;
}

export function useSelectShortcuts(target: SelectAllTarget, enabled = true): void {
  const ref = useRef(target);
  ref.current = target;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (handleSelectShortcut(e, ref.current)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
