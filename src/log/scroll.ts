// scroll.ts — the ONE auto-scroll rule of the log dock (feature §2). The panel
// follows the tail while the reader is at the bottom; the slack absorbs a wheel
// tick or a rounding error so "at the bottom" is not lost to a pixel.
// Pure: the element is read elsewhere, only the predicate lives here.

export const LOG_BOTTOM_SLACK_PX = 24;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function isAtBottom(m: ScrollMetrics, slack = LOG_BOTTOM_SLACK_PX): boolean {
  return m.scrollTop + m.clientHeight >= m.scrollHeight - slack;
}
