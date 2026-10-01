// svggrid.test.ts — square contact-sheet math for batched SVG generation.
import { describe, expect, it } from "vitest";
import { gridFor, MAX_PER_REQUEST } from "../src/lib/svggrid";

describe("gridFor", () => {
  it("zero images needs no grid", () => {
    expect(gridFor(0)).toEqual({ cols: 0, rows: 0, cells: 0, empty: 0 });
  });

  it.each([
    [1, 1, 1, 0],
    [2, 2, 1, 0],
    [3, 2, 2, 1], // spec: 3 images -> 2x2 with one empty cell
    [4, 2, 2, 0],
    [5, 3, 2, 1],
    [8, 3, 3, 1],
    [9, 3, 3, 0],
  ])("%i images -> %ix%i with %i empty", (n, cols, rows, empty) => {
    expect(gridFor(n)).toEqual({ cols, rows, cells: cols * rows, empty });
  });

  it("clamps at the maximum batch size", () => {
    expect(MAX_PER_REQUEST).toBe(9);
    expect(gridFor(MAX_PER_REQUEST).cells).toBe(9);
  });

  it("always fits every image and never has more empty cells than a row", () => {
    for (let n = 1; n <= MAX_PER_REQUEST; n++) {
      const g = gridFor(n);
      expect(g.cells).toBeGreaterThanOrEqual(n);
      expect(g.empty).toBe(g.cells - n);
      expect(g.rows).toBe(Math.ceil(n / g.cols));
    }
  });
});
