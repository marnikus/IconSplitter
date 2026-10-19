// useBatchHotkeys.ts — Batch arrows and A/D/W review; shared Q/E has one separate listener.

import { useEffect, useRef } from "react";
import { isTextField } from "../selection/hotkeys";
import { isNativeListKeyTarget } from "../ui/rowgesture";
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
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (handleReview(k, ref.current)) { e.preventDefault(); return; }
    if (!isNativeListKeyTarget(e.target) && handleArrow(e.key, ref.current)) e.preventDefault();
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
