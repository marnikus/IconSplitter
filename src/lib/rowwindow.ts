// rowwindow.ts — which rows are near the viewport (design D4). Pure math over the
// mounted rows' tops, which are monotonic in DOM order, so the range is found by
// binary search instead of scanning every row on every scroll. Zero rects (a hidden
// tab, happy-dom) mean "everything is near": the honest fallback, never a silently
// empty preview (RULE 4). Owned here, not in the hook, so it is testable as math.

import { OVERSCAN_PX } from "./previewlimits";

export interface RowWindow {
  /** First and last near row, inclusive; both -1 when nothing is near. */
  first: number;
  last: number;
  /** True when the caller had no rects at all: treat every row as near. */
  all: boolean;
}

/**
 * `tops[i]` is the top of row i in viewport coordinates, `viewTop`/`viewH` are the
 * scrolling element's own viewport, `overscan` the band planned beyond it.
 */
export function nearRange(tops: number[], viewTop: number, viewH: number, overscan: number = OVERSCAN_PX): RowWindow {
  if (tops.length === 0) return { first: -1, last: -1, all: true };
  const top = viewTop - overscan;
  const bottom = viewTop + viewH + overscan;
  const first = bottomOf(tops, top); // first row whose bottom reaches the band
  const last = topOf(tops, bottom); // last row whose top is inside the band
  if (first < 0 || last < 0 || first > last) return { first: -1, last: -1, all: false };
  return { first, last, all: false };
}

export function isNear(win: RowWindow, index: number): boolean {
  if (win.all) return true;
  return index >= win.first && index <= win.last;
}

/** Lowest index whose row bottom (the next row's top) is at or below `y`. */
function bottomOf(tops: number[], y: number): number {
  let lo = 0;
  let hi = tops.length - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const bottom = tops[mid + 1] ?? tops[mid];
    if (bottom >= y) {
      hit = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return hit;
}

/** Highest index whose row top is at or above `y`. */
function topOf(tops: number[], y: number): number {
  let lo = 0;
  let hi = tops.length - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] <= y) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return hit;
}
