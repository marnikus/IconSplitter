// SvgHotkeys.ts — the Generate SVG tab's keyboard layer (prompt §2, a11y §14).
// Reuses the Selection rules (RULE 10): arrows walk the active row, Space
// toggles its checkbox, G/A/D/W/V act on the active row only, and Escape closes
// an open dialog without sending anything. Text fields keep their keystrokes.

import { useEffect } from "react";
import { isTextField } from "../selection/hotkeys";
import { nextVisibleId } from "../lib/reviewselect";
import { isNativeListKeyTarget } from "../ui/rowgesture";
import type { ReviewStatus } from "../lib/svgfile";
import { shownVersion } from "./rowmodel";
import type { SvgRow } from "./types";

export interface SvgHotActions {
  visible: SvgRow[];
  activeId: string | null;
  dialogOpen: boolean;
  setActive: (id: string) => void;
  toggleCheck: (id: string) => void;
  generate: (ids: string[]) => void;
  decide: (ids: string[], decision: ReviewStatus) => void;
  showCode: (id: string, version: number) => void;
  dismissDialog: () => void;
}

export function useSvgHotkeys(a: SvgHotActions, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && a.dialogOpen) return a.dismissDialog();
      // A dialog is modal: Escape closes it and nothing else reaches the list
      // behind it. Otherwise a keystroke could re-plan the confirmation (the
      // "g" shortcut) and silently change what it is about to send.
      if (a.dialogOpen) return;
      if (swallowed(e)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") return walk(e, a, e.key === "ArrowDown" ? 1 : -1);
      const row = a.visible.find((r) => r.source.id === a.activeId);
      if (row !== undefined) runRowKey(e, row, a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a, enabled]);
}

/** Shortcuts belong to the list, never to a chord or to text being composed. */
function swallowed(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target)) return true;
  const nativeKey = e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp";
  return nativeKey && isNativeListKeyTarget(e.target);
}

/** One entry per key, so adding a shortcut never deepens a branch chain. */
const ROW_KEYS: Record<string, (row: SvgRow, a: SvgHotActions) => void> = {
  " ": (row, a) => a.toggleCheck(row.source.id),
  g: (row, a) => a.generate([row.source.id]),
  a: (row, a) => { if (shownVersion(row) !== null) a.decide([row.source.id], "approved"); },
  d: (row, a) => { if (shownVersion(row) !== null) a.decide([row.source.id], "declined"); },
  w: (row, a) => { if (shownVersion(row) !== null) a.decide([row.source.id], "needs-review"); },
  v: (row, a) => { const v = shownVersion(row); if (v !== null) a.showCode(row.source.id, v.version); },
};

function runRowKey(e: KeyboardEvent, row: SvgRow, a: SvgHotActions): void {
  const action = ROW_KEYS[e.key.toLowerCase()];
  if (!action) return;
  e.preventDefault();
  action(row, a);
}

/** Moves the active row and keeps it in view, exactly like the V2 list. */
function walk(e: KeyboardEvent, a: SvgHotActions, step: 1 | -1): void {
  e.preventDefault();
  const next = nextVisibleId(a.visible.map((r) => r.source.id), a.activeId, step);
  if (next) a.setActive(next);
}
