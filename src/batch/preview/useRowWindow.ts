// useRowWindow.ts — which rows are near the viewport, re-measured on scroll only
// when a frame is free (design D4). The math itself lives in lib/rowwindow (pure,
// tested); this hook is the only part that touches the DOM. The batch rows carry
// `data-testid="batch-row-<relPath>"`, so the band comes back as row IDENTITIES:
// an index into the list would be the wrong row the moment a filter, a sort or a
// single unchecked box changes which rows are planned (2026-10-12).

import { useCallback, useEffect, useState } from "react";
import { NEAR_ALL, nearWindow, type Rect, type RowWindow } from "../../lib/rowwindow";

const ROW_SELECTOR = '[data-testid^="batch-row-"]';

/** The mounted rows, in DOM order — the only nodes the window ever measures. */
function mountedRows(): Element[] {
  return Array.from(document.querySelectorAll(ROW_SELECTOR));
}

/** The band to plan around: the list's own box, or the viewport if it is not there. */
function bandRect(): Rect {
  const list = document.querySelector('[data-testid="batch-rows"]') ?? document.querySelector('[data-testid="scan-table"]');
  const rect = list?.getBoundingClientRect();
  if (rect && rect.height > 0) return { top: rect.top, bottom: rect.bottom };
  return { top: 0, bottom: window.innerHeight };
}

/** One frame's measurement: measure the band, hand back the row identities in it. */
function measureNow(setNear: (ids: Set<string>) => void): void {
  const rows = mountedRows();
  const rect = (i: number): Rect => rows[i]?.getBoundingClientRect() ?? { top: 0, bottom: 0 };
  setNear(nearIds(rows, nearWindow(rect, rows.length, bandRect())));
}

/** The rel paths of the rows the window covers, lower case (the plan's own keys). */
function nearIds(rows: Element[], win: RowWindow): Set<string> {
  if (win.all) return new Set(rows.map(testIdOf).filter(Boolean));
  const ids = new Set<string>();
  for (let i = win.first; i <= win.last && i < rows.length; i++) if (i >= 0) ids.add(testIdOf(rows[i]));
  return ids;
}

function testIdOf(el: Element): string {
  return (el.getAttribute("data-testid") ?? "").replace("batch-row-", "").toLowerCase();
}

export function useRowWindow(active: boolean): (relPath: string) => boolean {
  const [near, setNear] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!active) {
      setNear(new Set());
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      measureNow(setNear);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [active]);

  return useCallback((relPath: string) => near.has(relPath.toLowerCase()), [near]);
}

/** Exported for the tests: a session with no measured rows treats everything as near. */
export const ALL_NEAR_WINDOW = NEAR_ALL;
