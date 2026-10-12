// useRowWindow.ts — which rows are near the viewport, re-measured on scroll only
// when a frame is free (design D4). The math itself lives in lib/rowwindow (pure,
// tested); this hook is the only part that touches the DOM. The batch rows carry
// `data-testid="batch-row-*"`, and their rects are monotonic in DOM order, which is
// what lets the range be found by binary search instead of by walking 1000 rows.

import { useCallback, useEffect, useState } from "react";
import { isNear, nearRange, type RowWindow } from "../../lib/rowwindow";

const ALL_NEAR: RowWindow = { first: -1, last: -1, all: true };

/** Rows of the visible list, in render order. */
function rowTops(): number[] {
  const nodes = document.querySelectorAll('[data-testid^="batch-row-"]');
  const tops: number[] = [];
  for (const node of nodes) tops.push(node.getBoundingClientRect().top);
  return tops;
}

export function useRowWindow(active: boolean): (index: number) => boolean {
  const [win, setWin] = useState<RowWindow>(ALL_NEAR);

  useEffect(() => {
    if (!active) {
      setWin(ALL_NEAR);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      setWin(nearRange(rowTops(), 0, window.innerHeight));
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

  return useCallback((index: number) => isNear(win, index), [win]);
}
