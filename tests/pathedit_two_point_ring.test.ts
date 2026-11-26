// pathedit_two_point_ring.test.ts — a closed shape of only TWO curved points
// (a circle drawn with two anchors) is a real area (2026-11-26): it is a region,
// it cuts holes, it is clipped against and painted like a shape of 3+ points —
// no extra dot needed. Two points joined by straight lines stay no area.
import { describe, expect, it } from "vitest";
import { cutRegion, regionAt } from "../src/lib/pathedit/region";
import { clippedRegionAt, paintingGroupsAt } from "../src/lib/pathedit/boolean";
import { subToSegs } from "../src/lib/pathedit/curvecut";
import { fromPathData, isAreaRing, toPathData } from "../src/lib/pathedit/model";

const SQUARE = "M10 10L90 10L90 90L10 90Z";
// a circle of radius 20 around (50,50) drawn with two anchors
const CIRCLE2 = "M30 50C30 23.4 70 23.4 70 50C70 76.6 30 76.6 30 50Z";
const LENS2 = "M30 50L70 50Z";

describe("a two-point closed curve", () => {
  it("has two anchors and counts as an area; two straight points do not", () => {
    const m = fromPathData(CIRCLE2);
    expect(m.subs[0].anchors).toHaveLength(2);
    expect(isAreaRing(m.subs[0])).toBe(true);
    expect(subToSegs(m.subs[0])).toHaveLength(2);
    expect(isAreaRing(fromPathData(LENS2).subs[0])).toBe(false);
  });

  it("is a region under the pointer and paints", () => {
    expect(regionAt(fromPathData(CIRCLE2), { x: 50, y: 50 })).toBe(0);
    expect(paintingGroupsAt(fromPathData(CIRCLE2), { x: 50, y: 50 })).toHaveLength(1);
  });

  it("cuts a hole in a shape (Alt + Shift click inside it)", () => {
    const m = fromPathData(SQUARE + CIRCLE2);
    expect(clippedRegionAt(m, 1, { x: 50, y: 50 })).not.toBeNull();
    const out = cutRegion(m, 1, { x: 50, y: 50 });
    expect(out).not.toBeNull();
    expect(toPathData(out!)).not.toBe(toPathData(m));
  });

  it("is cut BY another shape, partly overlapping", () => {
    const m = fromPathData(CIRCLE2 + "M50 0L100 0L100 100L50 100Z");
    expect(cutRegion(m, 1, { x: 60, y: 50 })).not.toBeNull();
  });
});
