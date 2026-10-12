// useBatchHotkeys.ts — Batch folders hotkeys: ↑/↓ moves active, E selects active row only, Q deselects active row only, A approves / D declines the ACTIVE row (same keys and scope as the Generate SVG tab's SvgHotkeys)

import { useEffect, useRef } from "react";
import { isTextField } from "../selection/hotkeys";
import { handleSelectShortcut } from "../lib/selectshortcuts";
import { isDecidableRow } from "../lib/batchreview";
import type { ReviewStatus } from "../lib/reviewstatus";
import type { BatchSelection } from "./useBatchSelection";
import type { Row } from "./useBatchTypes";

/** The review half of the keyboard, wired by BatchPanel from useReview. */
export interface BatchReviewKeys {
  rows: Row[];
  activeId: string | null;
  decide: (relPaths: string[], review: ReviewStatus) => void;
}

export function useBatchHotkeys(sel: BatchSelection, enabled = true, review?: BatchReviewKeys): void {
  const ref = useRef(sel);
  ref.current = sel;
  const rv = useRef(review);
  rv.current = review;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTextField(e.target)) return;
      if (runSelectShortcut(e, ref)) { e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      runRowKey(e, ref.current, rv.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** The selection layer (E/Q/…) over the live view, kept out of the key switch. */
function runSelectShortcut(e: KeyboardEvent, ref: React.MutableRefObject<BatchSelection>): boolean {
  return handleSelectShortcut(e, {
    activeId: ref.current.activeId,
    selectActive: () => ref.current.checkActive(),
    deselectActive: () => ref.current.uncheckActive(),
    selectVisible: () => ref.current.checkVisible(),
    deselectAll: () => ref.current.uncheckAll(),
  });
}

/** Arrows walk the active row; A/D review it — everything else falls through. */
function runRowKey(e: KeyboardEvent, sel: BatchSelection, rv: BatchReviewKeys | undefined): void {
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    sel.moveActive(e.key === "ArrowUp" ? -1 : 1);
    return;
  }
  const k = e.key.toLowerCase();
  if (k === "a" || k === "d") { e.preventDefault(); reviewActive(k, rv); }
}

/** A/D review the active row only; an undecidable (missing/deleted) row is a silent no-op, like the SVG tab. */
function reviewActive(key: "a" | "d", rv: BatchReviewKeys | undefined): void {
  if (!rv) return;
  const row = rv.rows.find((r) => r.relPath === rv.activeId);
  if (!row || !isDecidableRow(row)) return;
  rv.decide([row.relPath], key === "a" ? "approved" : "declined");
}
