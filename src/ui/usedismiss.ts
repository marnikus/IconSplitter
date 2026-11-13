// usedismiss.ts — closes a popup on Escape or a press outside it (2026-11-06).
// One rule for every small popup: the filter dropdowns, Edit settings.

import { useEffect, type RefObject } from "react";

export function useDismiss(box: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [box, open, close]);
}
