// mergeseries.test.ts — TDD for the one-sweep merge-radius series (design D1, P1).
// RULE 8: real grids in, real numbers out. The oracle for the counts below is an
// INDEPENDENT implementation (BFS over the 8-neighbourhood), not a copy of the
// code under test — if the sweep is wrong these tests fail on real numbers.

import { describe, expect, it } from "vitest";
import { cellsByDistance, componentCountSeries, distanceToInk } from "../src/lib/mergeseries";

type Grid = { gw: number; gh: number; cells: Uint8Array; counts: Uint32Array };

/** A grid whose ink cells are single grid cells (ink = 1 each, like a thin mask). */
function grid(gw: number, gh: number, ink: [number, number][]): Grid {
  const cells = new Uint8Array(gw * gh);
  const counts = new Uint32Array(gw * gh);
  for (const [x, y] of ink) {
    cells[y * gw + x] = 1;
    counts[y * gw + x] = 1;
  }
  return { gw, gh, cells, counts };
}

function seeded(seed: number, gw: number, gh: number, on = 0.25): Grid {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ink: [number, number][] = [];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (rnd() < on) ink.push([x, y]);
  return grid(gw, gh, ink);
}

const NEIGHBOURS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

/** Chebyshev distance to the nearest ink cell, by BFS — the independent oracle. */
function bfsDistance(g: Grid): Int32Array | null {
  const { gw, gh, cells } = g;
  const dist = new Int32Array(gw * gh).fill(-1);
  const queue: number[] = [];
  for (let p = 0; p < cells.length; p++) if (cells[p]) { dist[p] = 0; queue.push(p); }
  if (!queue.length) return null;
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const x = p % gw;
    const y = (p / gw) | 0;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const q = ny * gw + nx;
      if (dist[q] !== -1) continue;
      dist[q] = dist[p] + 1;
      queue.push(q);
    }
  }
  return dist;
}

/** The detector's series, rebuilt from scratch: dilate = {cell : dist <= r}. */
function bfsSeries(g: Grid, rMax: number): number[] {
  const dist = bfsDistance(g);
  if (!dist) return new Array<number>(rMax).fill(0);
  const out: number[] = [];
  for (let r = 1; r <= rMax; r++) out.push(bfsCountAt(g, dist, r));
  return out;
}

function bfsCountAt(g: Grid, dist: Int32Array, r: number): number {
  const { gw, gh, counts } = g;
  const seen = new Uint8Array(gw * gh);
  const inks: number[] = [];
  for (let s = 0; s < seen.length; s++) {
    if (seen[s] || dist[s] < 0 || dist[s] > r) continue;
    let ink = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      ink += counts[p];
      const x = p % gw;
      const y = (p / gw) | 0;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const q = ny * gw + nx;
        if (seen[q] || dist[q] < 0 || dist[q] > r) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    inks.push(ink);
  }
  const maxInk = Math.max(0, ...inks);
  return inks.filter((v) => v >= maxInk * 0.015 && v > 0).length;
}

// Two 3-cell clusters on one row; the gap cells join at r=1 (x=3, x=8), r=2
// (x=4, x=7) and r=3 (x=5, x=6) — so the clusters merge exactly at r=3.
const twoClusters = grid(12, 5, [[1, 1], [2, 1], [1, 2], [9, 1], [10, 1], [9, 2]]);

describe("distanceToInk — exact chessboard distance", () => {
  it("returns null for a grid with no ink", () => {
    expect(distanceToInk(new Uint8Array(20), 4, 5)).toBeNull();
  });

  it("is 0 on ink and matches an independent BFS on random grids", () => {
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      const g = seeded(seed, 21, 13);
      const mine = distanceToInk(g.cells, g.gw, g.gh);
      const want = bfsDistance(g)!;
      expect(mine).not.toBeNull();
      expect([...mine!]).toEqual([...want]);
      for (let p = 0; p < g.cells.length; p++) if (g.cells[p]) expect(mine![p]).toBe(0);
    }
  });

  it("counts a diagonal step as one, like the square dilate it replaces", () => {
    const g = grid(9, 9, [[0, 0]]);
    const dist = distanceToInk(g.cells, g.gw, g.gh)!;
    expect(dist[4 * 9 + 4]).toBe(4); // down-right diagonal
    expect(dist[0 * 9 + 8]).toBe(8); // straight along the row
  });
});

describe("cellsByDistance — ascending buckets", () => {
  it("orders only the cells within the limit and reports each bucket's bounds", () => {
    const g = grid(5, 1, [[0, 0]]);
    const dist = distanceToInk(g.cells, g.gw, g.gh)!;
    const b = cellsByDistance(dist, 3);
    expect([...b.order]).toEqual([0, 1, 2, 3]); // the cell at distance 4 is out
    expect([...b.start]).toEqual([0, 1, 2, 3, 4]); // start[d]..start[d+1] is bucket d
    expect(b.maxPresent).toBe(3);
  });

  it("groups equal distances inside one bucket, in any order", () => {
    const g = grid(3, 3, [[0, 0]]);
    const dist = distanceToInk(g.cells, g.gw, g.gh)!;
    const b = cellsByDistance(dist, 1);
    expect([...b.order.slice(b.start[0], b.start[1])]).toEqual([0]); // the ink cell
    expect([...b.order.slice(b.start[1], b.start[2])].sort((p, q) => p - q)).toEqual([1, 3, 4]);
    expect(b.maxPresent).toBe(1);
  });
});

describe("componentCountSeries — the detector's series", () => {
  it("counts two clusters as two and one once the gap cells join at r=3", () => {
    const series = componentCountSeries(twoClusters, 6);
    expect(series[1]).toBe(2); // r=2: x=4 and x=7 joined, the middle gap (x=5,6) is still empty
    expect(series[2]).toBe(1); // r=3: x=5 and x=6 join and the two sides are one component
  });

  it("matches an independent BFS component count on random grids", () => {
    for (const seed of [3, 4, 6, 8, 12]) {
      const g = seeded(seed, 23, 17, 0.22);
      const rMax = 7;
      expect(componentCountSeries(g, rMax)).toEqual(bfsSeries(g, rMax));
    }
  });

  it("is all zeros for a grid with no ink (honest empty, RULE 4)", () => {
    const empty = new Uint8Array(30);
    expect(componentCountSeries({ gw: 6, gh: 5, cells: empty, counts: new Uint32Array(30) }, 8)).toEqual(new Array(8).fill(0));
  });

  it("returns one component once the grid floods, and keeps it beyond the last cell", () => {
    const g = grid(4, 1, [[0, 0], [3, 0]]);
    const series = componentCountSeries(g, 6);
    expect(series[2]).toBe(1); // r=3 reaches across the whole row
    expect(series[5]).toBe(1); // r > the farthest cell: the set cannot change any more
  });

  it("is non-increasing in the radius and never exceeds the ink cells", () => {
    for (const seed of [5, 9, 13, 21]) {
      const g = seeded(seed, 19, 11, 0.3);
      const rMax = 8;
      const series = componentCountSeries(g, rMax);
      const inkCells = g.cells.reduce((a, v) => a + v, 0);
      for (let r = 0; r < rMax; r++) {
        expect(series[r]).toBeLessThanOrEqual(inkCells);
        if (r > 0) expect(series[r]).toBeLessThanOrEqual(series[r - 1]);
      }
    }
  });

  it("drops a component whose ink is below 1.5 % of the largest one", () => {
    // A 9x9 blob (ink 81) and one far-away cell: 1 < 81 * 0.015, so the cell is
    // never counted — but doubling its ink makes it valid. That is the rule.
    const cells = new Uint8Array(20 * 10);
    const counts = new Uint32Array(20 * 10);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { cells[y * 20 + x] = 1; counts[y * 20 + x] = 1; }
    cells[9 * 20 + 19] = 1;
    counts[9 * 20 + 19] = 1;
    expect(componentCountSeries({ gw: 20, gh: 10, cells, counts }, 3)[0]).toBe(1);
    counts[9 * 20 + 19] = 2; // 2 >= 1.215 -> the speck is now a valid component
    expect(componentCountSeries({ gw: 20, gh: 10, cells, counts }, 3)[0]).toBe(2);
  });

  it("weighs components by ink, not by cell count", () => {
    // Both ends are single cells: the heavy one 100, the light one 1.
    const cells = new Uint8Array(12);
    const counts = new Uint32Array(12);
    cells[0] = 1;
    cells[11] = 1;
    counts[0] = 100;
    counts[11] = 1;
    expect(componentCountSeries({ gw: 12, gh: 1, cells, counts }, 6)[0]).toBe(1); // 1 < 100 * 0.015
    counts[11] = 3; // 3 >= 1.5 -> two valid components
    expect(componentCountSeries({ gw: 12, gh: 1, cells, counts }, 6)[0]).toBe(2);
  });
});
