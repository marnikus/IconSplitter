// rowwindow.ts — which rows are near the viewport (design D4). Pure math over the
// mounted rows' tops, which are monotonic in DOM order, so the range is found by
// binary search instead of scanning every row on every scroll. Zero rects (a hidden
// tab, happy-dom) mean "everything is near": the honest fallback, never a silently
// empty preview (RULE 4). Owned here, not in the hook, so it is testable as math.

import { NEAR_PROBE_MAX, OVERSCAN_PX } from "./previewlimits";

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

export interface Rect {
  top: number;
  bottom: number;
}

/** What "nothing is known about the layout" means: every row is near (RULE 4). */
export const NEAR_ALL: RowWindow = { first: -1, last: -1, all: true };

/**
 * The same band as `nearRange`, found without measuring every row: the row height is
 * estimated from the first and last rect, the band is turned into an index guess, and
 * the guess is walked outwards — at most `NEAR_PROBE_MAX` rows each way — until the
 * band is covered. Measuring 1000 rects on every scroll frame is what made scrolling
 * stutter during a preview, so the work has to be bounded by the viewport, not by the
 * list. Rows with mixed heights are why the walk exists: the estimate alone would miss.
 */
export function nearWindow(probe: (index: number) => Rect, count: number, band: Rect, overscan: number = OVERSCAN_PX): RowWindow {
  if (count <= 0) return NEAR_ALL;
  const span: Rect = { top: probe(0).top, bottom: probe(count - 1).top };
  if (span.top === span.bottom) return NEAR_ALL; // no vertical order to search: no layout at all
  const scan: Rect = { top: band.top - overscan, bottom: band.bottom + overscan };
  const guess = estimate(span, count, scan);
  return { first: walkLeft(probe, guess.first, scan.top), last: walkRight(probe, guess.last, count, scan.bottom), all: false };
}

/** The index guess: uniform rows make it exact, mixed heights leave it to the walk. */
function estimate(span: Rect, count: number, scan: Rect): { first: number; last: number } {
  const perRow = (span.bottom - span.top) / (count - 1);
  const at = (y: number) => Math.max(0, Math.min(count - 1, Math.round((y - span.top) / perRow)));
  return { first: at(scan.top), last: at(scan.bottom) };
}

/** How far left the band reaches; bounded, because the list is not. */
function walkLeft(probe: (index: number) => Rect, from: number, top: number): number {
  let i = from;
  for (let step = 0; step < NEAR_PROBE_MAX && i > 0; step++) {
    if (probe(i - 1).bottom < top) break;
    i--;
  }
  return i;
}

/** How far right it reaches; bounded for the same reason. */
function walkRight(probe: (index: number) => Rect, from: number, count: number, bottom: number): number {
  let i = from;
  for (let step = 0; step < NEAR_PROBE_MAX && i < count - 1; step++) {
    if (probe(i + 1).top > bottom) break;
    i++;
  }
  return i;
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
