// RULE 8 — tests execute the real thing: detect() runs against synthetic
// Analysis masks, not mocks. A deleted or inverted detect() fails here.
import { describe, expect, it } from "vitest";
import { detect, type Analysis } from "../src/lib/detect";

/** Builds an Analysis from a painter that marks ink pixels on a w×h mask. */
function makeAnalysis(w: number, h: number, paint: (x: number, y: number) => boolean): Analysis {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = paint(x, y) ? 1 : 0;
  return {
    w,
    h,
    scale: 1,
    mask,
    bg: [255, 255, 255],
    ink: [0, 0, 0],
    inkDiff: 200,
    threshold: 60,
  };
}

const square = (x0: number, y0: number, size: number) => (x: number, y: number) =>
  x >= x0 && x < x0 + size && y >= y0 && y < y0 + size;

function paintTwo(...squares: [number, number, number][]) {
  return (x: number, y: number) => squares.some(([x0, y0, s]) => square(x0, y0, s)(x, y));
}

describe("detect — real ink-mask detection", () => {
  it("finds two separated icons as two boxes", () => {
    const a = makeAnalysis(80, 80, paintTwo([10, 10, 10], [50, 50, 10]));
    const res = detect(a, null);
    expect(res.boxes).toHaveLength(2);
    expect(res.usedFrac).toBeGreaterThan(0);
    expect(res.autoFrac).toBeGreaterThan(0);
  });

  it("boxes hug the ink with a 1px margin and scale with Analysis.scale", () => {
    const a = makeAnalysis(80, 80, square(10, 20, 10));
    const res = detect(a, null);
    expect(res.boxes).toHaveLength(1);
    const b = res.boxes[0];
    expect(b.x).toBe(9); // minX - 1
    expect(b.y).toBe(19); // minY - 1
    expect(b.w).toBe(12); // (maxX + 2) - (minX - 1)
    expect(b.h).toBe(12);
    expect(b.ink).toBe(100);
  });

  it("a small merge radius keeps close strokes separate; a large one merges them", () => {
    const a = makeAnalysis(80, 80, paintTwo([10, 10, 6], [20, 10, 6]));
    // r = round(frac * longest / f) with longest = 80, f = 1
    expect(detect(a, 1 / 80).boxes).toHaveLength(2); // r = 1, gap survives
    expect(detect(a, 5 / 80).boxes).toHaveLength(1); // r = 5, gap bridged
  });

  it("filters dust: components below 1.5% of the largest ink never become boxes", () => {
    const a = makeAnalysis(80, 80, paintTwo([10, 10, 12], [60, 60, 1]));
    const res = detect(a, 1 / 80);
    expect(res.boxes).toHaveLength(1);
    expect(res.boxes[0].ink).toBe(144);
  });

  it("orders boxes in reading order: rows top→bottom, inside a row left→right", () => {
    const a = makeAnalysis(80, 80, paintTwo([40, 10, 10], [10, 10, 10], [10, 50, 10]));
    const res = detect(a, null);
    expect(res.boxes).toHaveLength(3);
    const xs = res.boxes.map((b) => Math.round(b.x));
    const ys = res.boxes.map((b) => Math.round(b.y));
    expect([xs, ys]).toEqual([
      [9, 39, 9],
      [9, 9, 49],
    ]);
  });
});
