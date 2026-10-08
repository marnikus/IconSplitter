// upload_expand_geom.test.ts — the built-in stroke expander's geometry
// (2026-10-09, design D4): pinned outlines where the answer is exact, and
// measured coverage, area and offset distance everywhere else — what a stock
// reviewer sees, never anchor counts.
import { describe, expect, it } from "vitest";
import { expandOutline, type Pen } from "../src/lib/upload/geom/expand/assemble";
import { outlineToPathData, pathOutline, type Outline } from "../src/lib/upload/geom/outline";
import { area, centreline, distanceToPolyline, filledArea, polygons, winding, type Pt } from "./helpers/outlinemath";

const pen = (over: Partial<Pen> = {}): Pen => ({ width: 2, cap: "butt", join: "miter", miter: 4, ...over });
const outline = (d: string): Outline => pathOutline(d) as Outline;
const expand = (d: string, p: Partial<Pen> = {}) => expandOutline(outline(d), pen(p));
const cubics = (o: Outline) => o.ops.filter((op) => op.op === "C").length;

/**
 * Every sample within w/2 − tol of the centreline is covered; every sample
 * beyond w/2 + tol is not. Samples near an open end are skipped unless the
 * cap is round (a butt/square end is not a half-disc), and samples near a
 * corner unless the join is round (a miter reaches past w/2 on purpose).
 */
function expectCoverage(d: string, p: Partial<Pen>, box: [number, number, number, number], tol = 0.05): void {
  const line = centreline(outline(d));
  const o = expand(d, p);
  const half = pen(p).width / 2;
  const closed = outline(d).ops.some((op) => op.op === "Z");
  const ends = closed || pen(p).cap === "round" ? [] : [line[0], line[line.length - 1]];
  const corners = pen(p).join === "round" ? [] : line.slice(closed ? 0 : 1, closed ? line.length : -1);
  for (let x = box[0]; x <= box[2]; x += 0.25) {
    for (let y = box[1]; y <= box[3]; y += 0.25) {
      if (ends.some((e) => Math.hypot(x - e[0], y - e[1]) < half + tol)) continue;
      if (corners.some((c) => Math.hypot(x - c[0], y - c[1]) < half * Math.SQRT2 + tol)) continue;
      const dist = distanceToPolyline([x, y], line);
      if (dist < half - tol) expect(winding(o, [x, y]), `(${x},${y}) at ${dist.toFixed(2)} should be filled`).not.toBe(0);
      if (dist > half + tol) expect(winding(o, [x, y]), `(${x},${y}) at ${dist.toFixed(2)} should be empty`).toBe(0);
    }
  }
}

describe("caps on a straight line (0,0)→(10,0), width 2", () => {
  it("butt: the exact rectangle, pinned", () => {
    expect(outlineToPathData(expand("M0 0L10 0"))).toBe("M0 -1L10 -1L10 1L0 1Z");
  });

  it("square: extended by w/2 at both ends", () => {
    const o = expand("M0 0L10 0", { cap: "square" });
    const pts = polygons(o).flat();
    expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(-1, 6);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(11, 6);
    expect(Math.abs(area(o))).toBeCloseTo(24, 6);
  });

  it("round: a semicircle of two cubics per end, the area of a rectangle plus one disc", () => {
    const o = expand("M0 0L10 0", { cap: "round" });
    expect(cubics(o)).toBe(4);
    expect(Math.abs(area(o))).toBeCloseTo(20 + Math.PI, 2);
    expectCoverage("M0 0L10 0", { cap: "round" }, [-2, -2, 12, 2]);
  });
});

describe("joins at a right angle (0,0)→(10,0)→(10,10), width 2", () => {
  it("miter: the outer corner is the exact miter point, the inner corner is covered (no hole)", () => {
    const o = expand("M0 0L10 0L10 10");
    const pts = polygons(o).flat();
    expect(pts.some((p) => Math.abs(p[0] - 11) < 1e-9 && Math.abs(p[1] + 1) < 1e-9)).toBe(true); // the miter tip
    expect(winding(o, [9.5, 0.5])).not.toBe(0); // the inner corner square
    expect(winding(o, [10.5, 0.5])).not.toBe(0);
    expectCoverage("M0 0L10 0L10 10", {}, [-1, -2, 12, 11]);
  });

  it("miter beyond stroke-miterlimit becomes a bevel", () => {
    const o = expand("M0 0L10 0L10 10", { miter: 1 });
    const pts = polygons(o).flat();
    expect(pts.some((p) => Math.abs(p[0] - 11) < 1e-9 && Math.abs(p[1] + 1) < 1e-9)).toBe(false);
    expect(Math.abs(filledArea(o) - 39.5)).toBeLessThan(0.3); // two bars (40) − the overlap (1) + the bevel's half of the corner square (0.5)
  });

  it("round: one ≤ 90° arc on the outer corner, the area of the miter case minus the rounded tip", () => {
    const o = expand("M0 0L10 0L10 10", { join: "round" });
    expect(cubics(o)).toBe(1);
    expect(Math.abs(filledArea(o) - (39 + Math.PI / 4))).toBeLessThan(0.3); // the corner square's quarter disc
  });

  it("bevel: the corner cut straight across", () => {
    const o = expand("M0 0L10 0L10 10", { join: "bevel" });
    expect(cubics(o)).toBe(0);
    expect(Math.abs(filledArea(o) - 39.5)).toBeLessThan(0.3);
  });
});

describe("closed subpaths", () => {
  it("a closed square stroke is a ring: two subpaths, the nonzero fill is outer minus inner, nothing inside", () => {
    const o = expand("M0 0L10 0L10 10L0 10Z");
    expect(o.ops.filter((op) => op.op === "M")).toHaveLength(2);
    expect(o.ops.filter((op) => op.op === "Z")).toHaveLength(2);
    expect(Math.abs(filledArea(o) - (144 - 64))).toBeLessThan(0.4); // 12² − 8²; the pivot's corner loops are covered twice, never left open (D4)
    expect(winding(o, [5, 5])).toBe(0);
    expect(winding(o, [0.5, 0.5])).not.toBe(0); // every inner corner square is covered
    expect(winding(o, [9.5, 9.5])).not.toBe(0);
    expectCoverage("M0 0L10 0L10 10L0 10Z", {}, [-2, -2, 12, 12]);
  });

  it("a circle of radius 10 stroked width 2: the annulus area within 0.5 % (TOL 0.01 along a 126 px boundary), every boundary sample 1 ± 0.01 from the centreline", () => {
    const k = 0.5522847498 * 10;
    const d = `M10 0C10 ${k} ${k} 10 0 10C${-k} 10 -10 ${k} -10 0C-10 ${-k} ${-k} -10 0 -10C${k} -10 10 ${-k} 10 0Z`;
    const o = expand(d);
    const want = Math.PI * (11 * 11 - 9 * 9);
    expect(Math.abs(Math.abs(area(o)) - want) / want).toBeLessThan(0.005);
    for (const p of polygons(o, 256).flat()) {
      expect(Math.abs(Math.abs(Math.hypot(p[0], p[1]) - 10) - 1)).toBeLessThan(0.01);
    }
  });
});

describe("curves stay curves", () => {
  it("an S-curve offset: cubics (no polyline faceting), every boundary sample within 0.01 of distance 1", () => {
    const d = "M0 0C10 0 0 10 10 10";
    const o = expand(d);
    expect(cubics(o)).toBeGreaterThan(0);
    expect(o.ops.filter((op) => op.op === "L").length).toBeLessThan(4); // only the two butt caps may be lines
    const line = centreline(outline(d));
    const dense: Pt[] = [];
    for (let i = 0; i <= 400; i += 1) {
      const t = i / 400; const u = 1 - t;
      dense.push([3 * u * u * t * 10 + t * t * t * 10, 3 * u * t * t * 10 + t * t * t * 10]);
    }
    void line;
    for (const p of polygons(o).flat()) {
      if (p[1] < 0.3 || p[1] > 9.7) continue; // the caps
      expect(Math.abs(distanceToPolyline(p, dense) - 1)).toBeLessThan(0.012);
    }
  });
});

describe("zero-length subpaths", () => {
  it("round → a dot, square → a square, butt → nothing (SVG)", () => {
    expect(Math.abs(area(expand("M5 5L5 5", { cap: "round" })))).toBeCloseTo(Math.PI, 2);
    expect(Math.abs(area(expand("M5 5Z", { cap: "square" })))).toBeCloseTo(4, 6);
    expect(expand("M5 5L5 5").ops).toEqual([]);
  });
});
