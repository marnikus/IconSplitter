// grid.test.ts — TDD for the coarse grid the detector works on (design P1).
// Owns the contract `detect` and the merge series both rely on: one cell per
// f x f pixels, the pixel→cell column map, and each cell's ink count.

import { describe, expect, it } from "vitest";
import { buildGridMap, cellSize } from "../src/lib/grid";

function maskOf(w: number, h: number, ink: (x: number, y: number) => boolean): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) mask[y * w + x] = 1;
  return mask;
}

describe("cellSize — the downscale that caps detection cost", () => {
  it("keeps a sheet at full resolution up to 400 px and grows from there", () => {
    expect(cellSize(1)).toBe(1);
    expect(cellSize(400)).toBe(1);
    expect(cellSize(401)).toBe(2);
    expect(cellSize(1024)).toBe(3);
    expect(cellSize(4000)).toBe(10);
  });
});

describe("buildGridMap — pixels in, cells and ink counts out", () => {
  it("maps a 2x2 ink block into one cell and reports the ink it carries", () => {
    const mask = maskOf(4, 4, (x, y) => x < 2 && y < 2);
    const g = buildGridMap(mask, 4, 4, 2);
    expect([g.gw, g.gh, g.f]).toEqual([2, 2, 2]);
    expect([...g.cells]).toEqual([1, 0, 0, 0]);
    expect([...g.counts]).toEqual([4, 0, 0, 0]);
    expect([...g.col]).toEqual([0, 0, 1, 1]);
  });

  it("accounts for every ink pixel exactly once, even on a ragged grid", () => {
    const mask = maskOf(5, 3, (x, y) => (x + y) % 2 === 0); // 5x3 -> gw 3, gh 2 with f=2
    const g = buildGridMap(mask, 5, 3, 2);
    const inkPixels = mask.reduce((a, v) => a + v, 0);
    expect([g.gw, g.gh]).toEqual([3, 2]);
    expect(g.counts.reduce((a, v) => a + v, 0)).toBe(inkPixels);
  });

  it("marks a cell as ink when any of its pixels is ink", () => {
    const mask = maskOf(6, 2, (x) => x === 5); // f=2 -> 3x1 cells, ink falls in the last one
    const g = buildGridMap(mask, 6, 2, 2);
    expect([...g.cells]).toEqual([0, 0, 1]);
    expect([...g.counts]).toEqual([0, 0, 2]);
  });

  it("is the identity for f = 1 (no downscale, one cell per pixel)", () => {
    const mask = maskOf(3, 2, (x, y) => x === y);
    const g = buildGridMap(mask, 3, 2, 1);
    expect([...g.cells]).toEqual([...mask]);
    expect([...g.counts]).toEqual([...mask]);
    expect([...g.col]).toEqual([0, 1, 2]);
  });
});
