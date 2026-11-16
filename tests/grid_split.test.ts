// @vitest-environment node
// grid_split.test.ts — TDD for 2x2 lightbulb grid failure
// Image: 4 icons in grid with thin dividers that previously merged into 1

import { describe, expect, it } from "vitest";
import { detect, type Analysis } from "../src/lib/detect";

function makeAnalysis(w: number, h: number, paint: (x: number, y: number) => boolean): Analysis {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = paint(x, y) ? 1 : 0;
  return { w, h, scale: 1, mask, bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 200, threshold: 60 };
}

function paintGridWithDividers() {
  return (x: number, y: number) => {
    // 4 squares 30px at (10,10), (60,10), (10,60), (60,60) in 100x100
    const inSquare =
      (x >= 10 && x < 40 && y >= 10 && y < 40) ||
      (x >= 60 && x < 90 && y >= 10 && y < 40) ||
      (x >= 10 && x < 40 && y >= 60 && y < 90) ||
      (x >= 60 && x < 90 && y >= 60 && y < 90);
    // thin dividers: vertical at 49-50, horizontal at 49-50 spanning full
    const vLine = x >= 49 && x < 51;
    const hLine = y >= 49 && y < 51;
    return inSquare || vLine || hLine;
  };
}

function paintFourSeparated() {
  return (x: number, y: number) => {
    return (
      (x >= 10 && x < 40 && y >= 10 && y < 40) ||
      (x >= 60 && x < 90 && y >= 10 && y < 40) ||
      (x >= 10 && x < 40 && y >= 60 && y < 90) ||
      (x >= 60 && x < 90 && y >= 60 && y < 90)
    );
  };
}

function paintTightGrid() {
  // gap only 4px between squares, no dividers, to test auto radius prefers higher count
  return (x: number, y: number) => {
    return (
      (x >= 10 && x < 38 && y >= 10 && y < 38) ||
      (x >= 42 && x < 70 && y >= 10 && y < 38) ||
      (x >= 10 && x < 38 && y >= 42 && y < 70) ||
      (x >= 42 && x < 70 && y >= 42 && y < 70)
    );
  };
}

describe("grid split — 2x2 lightbulb failure", () => {
  it("4 icons with thin full-span dividers should split into 4 after grid line removal", () => {
    const a = makeAnalysis(100, 100, paintGridWithDividers());
    const res = detect(a, 0); // radius 0, no merging
    // With grid line removal, dividers should be removed, leaving 4 boxes
    expect(res.boxes).toHaveLength(4);
  });

  it("4 separated icons without dividers should be 4 at auto", () => {
    const a = makeAnalysis(100, 100, paintFourSeparated());
    const res = detect(a, null);
    expect(res.boxes).toHaveLength(4);
  });

  it("tight grid with 4px gap should prefer 4 over 1 at auto (higher count wins)", () => {
    const a = makeAnalysis(80, 80, paintTightGrid());
    const res = detect(a, null);
    // Previously auto picked 1 because len(1) > len(4), now should pick 4
    expect(res.boxes.length).toBeGreaterThanOrEqual(2);
    // Ideally 4
    expect(res.boxes).toHaveLength(4);
  });

  it("auto radius should not fallback to 1 when count>=2 exists", () => {
    // 2 icons far apart, gap large, series: 2 for many r, 1 for large r
    // Should pick 2, not 1
    const paintTwo = (x: number, y: number) => (x >= 10 && x < 20 && y >= 10 && y < 20) || (x >= 60 && x < 70 && y >= 10 && y < 20);
    const a = makeAnalysis(80, 80, paintTwo);
    const res = detect(a, null);
    expect(res.boxes).toHaveLength(2);
  });
});
