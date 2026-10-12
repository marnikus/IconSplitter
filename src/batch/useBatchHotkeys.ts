// useBatchHotkeys.ts — Batch hotkeys: ↑/↓ active, E/Q select, A/D/W review (approved/declined/warning)

import { useEffect, useRef } from "react";
import { isTextField } from "../selection/hotkeys";
import { handleSelectShortcut } from "../lib/selectshortcuts";
import type { BatchSelection } from "./useBatchSelection";
import type { BatchReviewStatus } from "../lib/statefile";

type Target = BatchSelection & { decideActive?: (r: BatchReviewStatus) => void };

function handleReview(k: string, t: Target): boolean {
  if (k === "a") { t.decideActive?.("approved"); return true; }
  if (k === "d") { t.decideActive?.("declined"); return true; }
  if (k === "w") { t.decideActive?.("warning"); return true; }
  return false;
}

function handleArrow(key: string, t: Target): boolean {
  if (key === "ArrowUp") { t.moveActive(-1); return true; }
  if (key === "ArrowDown") { t.moveActive(1); return true; }
  return false;
}

function makeOnKey(ref: React.MutableRefObject<Target>) {
  return (e: KeyboardEvent) => {
    if (isTextField(e.target)) return;
    if (
      handleSelectShortcut(e, {
        activeId: ref.current.activeId,
        selectActive: () => ref.current.checkActive(),
        deselectActive: () => ref.current.uncheckActive(),
        selectVisible: () => ref.current.checkVisible(),
        deselectAll: () => ref.current.uncheckAll(),
      })
    ) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (handleReview(k, ref.current)) { e.preventDefault(); return; }
    if (handleArrow(e.key, ref.current)) { e.preventDefault(); }
  };
}

export function useBatchHotkeys(sel: Target, enabled = true): void {
  const ref = useRef(sel);
  ref.current = sel;
  useEffect(() => {
    if (!enabled) return;
    const onKey = makeOnKey(ref);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
