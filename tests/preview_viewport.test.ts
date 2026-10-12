// preview_viewport.test.ts — TDD for "which rows are near the viewport" (design D4/T10).
// Pure math over row tops (monotonic in DOM order) and the scroll window, so the
// preview can plan visible rows first without an IntersectionObserver — and so the
// answer is testable without a layout engine. No rects at all = everything is near
// (happy-dom, a hidden tab): the honest fallback, not a silently empty preview.

import { describe, expect, it } from "vitest";
import { isNear, nearRange, nearWindow } from "../src/lib/rowwindow";
import { NEAR_PROBE_MAX } from "../src/lib/previewlimits";

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

describe("nearWindow — the same band, found without measuring every row", () => {
  const uniform = (height = 40) => (i: number) => ({ top: i * height, bottom: (i + 1) * height });
  const topsOf = (count: number, height = 40) => Array.from({ length: count }, (_, i) => i * height);

  it("agrees with a full scan for uniform rows, and stays tight", () => {
    const count = 5000;
    const probe = uniform();
    const tops = topsOf(count);
    for (const [bandTop, viewH] of [[0, 800], [4000, 800], [196_000, 800], [12_345, 600]] as const) {
      const win = nearWindow(probe, count, { top: bandTop, bottom: bandTop + viewH });
      const want = nearRange(tops, bandTop, viewH);
      expect(win.all).toBe(false);
      expect(win.first).toBeLessThanOrEqual(want.first);
      expect(win.last).toBeGreaterThanOrEqual(want.last);
      expect(win.last - win.first).toBeLessThan(64); // a band, not "everything"
    }
  });

  it("measures a few dozen rows instead of thousands", () => {
    let probes = 0;
    const win = nearWindow((i) => {
      probes++;
      return uniform()(i);
    }, 10_000, { top: 200_000, bottom: 201_000 });
    expect(probes).toBeLessThanOrEqual(NEAR_PROBE_MAX);
    expect(win.first).toBeGreaterThan(4900);
    expect(win.last).toBeLessThan(5100);
  });

  it("still finds the band when the rows are not all the same height", () => {
    // Every other row is tall (a row showing its strip) — the estimate is off, the
    // bounded walk is what makes it right.
    const rect = (i: number) => {
      const top = Math.floor(i / 2) * 100 + (i % 2) * 40;
      return { top, bottom: top + (i % 2 === 0 ? 40 : 60) };
    };
    const win = nearWindow(rect, 400, { top: 19_000, bottom: 19_600 });
    expect(win.all).toBe(false);
    expect(win.first).toBeLessThanOrEqual(win.last);
    // Every row that really intersects the band is inside the window.
    for (let i = 0; i < 400; i++) {
      const r = rect(i);
      if (r.bottom >= 19_000 && r.top <= 19_600) {
        expect(i).toBeGreaterThanOrEqual(win.first);
        expect(i).toBeLessThanOrEqual(win.last);
      }
    }
  });

  it("a list with no layout at all is fully near — never an empty preview", () => {
    expect(nearWindow(() => ({ top: 0, bottom: 0 }), 1000, { top: 0, bottom: 800 })).toEqual({ first: -1, last: -1, all: true });
    expect(nearWindow(() => ({ top: 0, bottom: 0 }), 0, { top: 0, bottom: 800 }).all).toBe(true);
  });
});
