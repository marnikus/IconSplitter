// preview_viewport.test.ts — TDD for "which rows are near the viewport" (design D4/T10).
// Pure math over row tops (monotonic in DOM order) and the scroll window, so the
// preview can plan visible rows first without an IntersectionObserver — and so the
// answer is testable without a layout engine. No rects at all = everything is near
// (happy-dom, a hidden tab): the honest fallback, not a silently empty preview.

import { describe, expect, it } from "vitest";
import { isNear, nearRange } from "../src/lib/rowwindow";

const TOPS = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];

describe("nearRange — the viewport window with its overscan", () => {
  it("takes the rows the viewport touches, plus the overscan band", () => {
    expect(nearRange(TOPS, 150, 100, 0)).toMatchObject({ first: 1, last: 2 });
  });

  it("an overscan widens the band on both sides", () => {
    // A row counts as near if it reaches the band (its bottom is the next row's top)
    // or if its own top falls inside it — the same rule the linear scan below uses.
    expect(nearRange(TOPS, 150, 100, 300)).toMatchObject({ first: 0, last: 5 });
    expect(nearRange(TOPS, 300, 100, 100)).toMatchObject({ first: 1, last: 5 });
  });

  it("scrolling to the end still finds the last rows", () => {
    expect(nearRange(TOPS, 800, 100, 0)).toMatchObject({ first: 7, last: 9 });
    expect(nearRange(TOPS, 5000, 100, 0)).toMatchObject({ first: -1, last: -1 }); // past the end
  });

  it("a viewport above the list finds only the first rows", () => {
    expect(nearRange(TOPS, -500, 100, 0)).toMatchObject({ first: -1, last: -1 });
    expect(nearRange(TOPS, -150, 200, 0)).toMatchObject({ first: 0, last: 0 });
  });

  it("no rects at all means everything is near — nothing is quietly skipped", () => {
    const win = nearRange([], 0, 600);
    expect(win).toEqual({ first: -1, last: -1, all: true });
    expect(isNear(win, 0)).toBe(true);
    expect(isNear(win, 999)).toBe(true);
  });

  it("answers the same as a linear scan on a long list (the binary search is exact)", () => {
    const tops = Array.from({ length: 400 }, (_, i) => i * 37);
    for (const scroll of [0, 500, 3000, 9000, 14000]) {
      const win = nearRange(tops, scroll, 400, 300);
      const expected: number[] = [];
      tops.forEach((top, i) => {
        const bottom = tops[i + 1] ?? top + 37;
        if (bottom >= scroll - 300 && top <= scroll + 400 + 300) expected.push(i);
      });
      const got: number[] = [];
      for (let i = 0; i < tops.length; i++) if (isNear(win, i)) got.push(i);
      expect(got).toEqual(expected);
    }
  });

  it("an index outside the list is never near", () => {
    expect(isNear(nearRange(TOPS, 150, 100, 0), 500)).toBe(false);
    expect(isNear(nearRange(TOPS, 150, 100, 0), 1)).toBe(true);
  });
});
