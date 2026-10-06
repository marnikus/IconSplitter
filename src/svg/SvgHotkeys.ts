// SvgHotkeys.ts — the Generate SVG tab's keyboard layer (prompt §2, a11y §14).
// Reuses the Selection rules (RULE 10): arrows walk the active row, Space
// toggles its checkbox, G/A/D/V act on the active row only, and Escape closes
// an open dialog without sending anything. Text fields keep their keystrokes.

import { useEffect } from "react";
import { isTextField } from "../selection/hotkeys";
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

export function useSvgHotkeys(a: SvgHotActions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && a.dialogOpen) return a.dismissDialog();
      if (swallowed(e)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") return walk(e, a, e.key === "ArrowDown" ? 1 : -1);
      const row = a.visible.find((r) => r.source.id === a.activeId);
      if (row !== undefined) runRowKey(e.key, row, a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a]);
}

/** Shortcuts belong to the list, never to a chord or to text being composed. */
function swallowed(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target);
}

/** One entry per key, so adding a shortcut never deepens a branch chain. */
const ROW_KEYS: Record<string, (row: SvgRow, a: SvgHotActions) => void> = {
  " ": (row, a) => a.toggleCheck(row.source.id),
  g: (row, a) => a.generate([row.source.id]),
  a: (row, a) => { if (shownVersion(row) !== null) a.decide([row.source.id], "approved"); },
  d: (row, a) => { if (shownVersion(row) !== null) a.decide([row.source.id], "declined"); },
  v: (row, a) => { const v = shownVersion(row); if (v !== null) a.showCode(row.source.id, v.version); },
};

function runRowKey(key: string, row: SvgRow, a: SvgHotActions): void {
  ROW_KEYS[key.toLowerCase()]?.(row, a);
}

/** Moves the active row and keeps it in view, exactly like the V2 list. */
function walk(e: KeyboardEvent, a: SvgHotActions, step: number): void {
  e.preventDefault();
  const at = a.visible.findIndex((r) => r.source.id === a.activeId);
  const next = a.visible[at + step];
  if (next) a.setActive(next.source.id);
}
