// up_fit.test.ts — the artboard, fit and stroke-sizing math executes for real
// (RULE 8): the square default, the fit artboard, uniform padding, proportional
// centring, integer 15.1 MP raster dimensions, and the ONE pt→unit rule that
// keeps SVG, JPEG and EPS visually identical. Deleting the module fails every
// assertion here.
import { describe, expect, it } from "vitest";
import { STROKE_REF_DPI } from "../src/lib/upsettings";
import {
  ARTBOARD_UNITS, EPS_UNITS_PER_ARTBOARD_UNIT, actualMpx, fitPlan, pxPerArtboardUnit, rasterSize,
  strokeInArtboardUnits, strokeInUserUnits,
} from "../src/lib/upfit";
import type { Bounds } from "../src/lib/upgeom";

const SQUARE: Bounds = { minX: 10, minY: 20, maxX: 110, maxY: 120 }; // 100×100 content
const WIDE: Bounds = { minX: 0, minY: 40, maxX: 200, maxY: 60 }; // 200×20 content

describe("upfit — artboard and fit (prompt §5)", () => {
  it("uses the square 1000×1000 artboard by default and centres the content", () => {
    const plan = fitPlan(SQUARE, { paddingPct: 8, artboard: "square" });
    expect(plan.artboard).toEqual({ w: ARTBOARD_UNITS, h: ARTBOARD_UNITS });
    expect(ARTBOARD_UNITS).toBe(1000);
    // content 100 units wide scaled into 84% of 1000 → scale 8.4, centred
    expect(plan.scale).toBeCloseTo(8.4, 6);
    expect(plan.translate.x).toBeCloseTo((1000 - 840) / 2 - 10 * 8.4, 6);
    expect(plan.translate.y).toBeCloseTo((1000 - 840) / 2 - 20 * 8.4, 6);
  });

  it("fits proportionally — never stretches, never crops (wide content letterboxes)", () => {
    const plan = fitPlan(WIDE, { paddingPct: 8, artboard: "square" });
    expect(plan.scale).toBeCloseTo(4.2, 6); // limited by width: 840/200
    expect(plan.translate.y).toBeCloseTo((1000 - 20 * 4.2) / 2 - 40 * 4.2, 6); // centred vertically
  });

  it("the fit artboard takes the content's own aspect, longer side 1000", () => {
    const plan = fitPlan(WIDE, { paddingPct: 0, artboard: "fit" });
    expect(plan.artboard).toEqual({ w: 1000, h: 100 });
    expect(plan.scale).toBeCloseTo(5, 6);
  });

  it("padding is uniform on every side, as a share of the artboard", () => {
    const p8 = fitPlan(SQUARE, { paddingPct: 8, artboard: "square" });
    const p0 = fitPlan(SQUARE, { paddingPct: 0, artboard: "square" });
    expect(p0.scale).toBeCloseTo(10, 6);
    expect(p8.scale).toBeCloseTo(8.4, 6); // (100 - 2×8)% of the side
  });

  it("degenerate content never divides by zero", () => {
    const line = fitPlan({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, { paddingPct: 8, artboard: "square" });
    expect(line.scale).toBeGreaterThan(0);
  });
});

describe("upfit — raster dimensions (prompt §7)", () => {
  it("renders the square default at ~15.1 MP with integer dimensions", () => {
    const plan = fitPlan(SQUARE, { paddingPct: 8, artboard: "square" });
    const r = rasterSize(plan, 15.1);
    expect(r.width).toBe(3886);
    expect(r.height).toBe(3886);
    expect(actualMpx(r)).toBeGreaterThanOrEqual(15.1);
    expect(actualMpx(r)).toBeLessThan(15.11);
    expect(Number.isInteger(r.width)).toBe(true);
  });

  it("a fit artboard keeps its aspect at the target megapixels", () => {
    const plan = fitPlan(WIDE, { paddingPct: 0, artboard: "fit" }); // 10:1
    const r = rasterSize(plan, 15.1);
    expect(r.width / r.height).toBeCloseTo(10, 1);
    expect(actualMpx(r)).toBeGreaterThanOrEqual(15.1);
    expect(actualMpx(r)).toBeLessThan(15.2);
  });

  it("never renders a zero-pixel edge", () => {
    const plan = fitPlan({ minX: 0, minY: 0, maxX: 1, maxY: 1000 }, { paddingPct: 0, artboard: "fit" });
    const r = rasterSize(plan, 1);
    expect(r.width).toBeGreaterThanOrEqual(1);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });
});

describe("upfit — the stroke rule (prompt §5: pt is never unexplained px)", () => {
  const plan = fitPlan(SQUARE, { paddingPct: 8, artboard: "square" });
  const raster = rasterSize(plan, 15.1);

  it("defines the stroke at the output raster: 2.2 pt = 2.2×(96/72) px", () => {
    const R = pxPerArtboardUnit(plan, raster);
    expect(R).toBeCloseTo(3.886, 3);
    const artboard = strokeInArtboardUnits(2.2, plan, raster);
    expect(artboard * R).toBeCloseTo(2.2 * (STROKE_REF_DPI / 72), 6);
  });

  it("converts the artboard stroke into the element's own user units", () => {
    const user = strokeInUserUnits(2.2, plan, raster, { fitScale: plan.scale, elemScale: 2 });
    expect(user * 2 * plan.scale).toBeCloseTo(strokeInArtboardUnits(2.2, plan, raster), 6);
  });

  it("puts the EPS page at the JPEG's 96-DPI physical size, so setlinewidth is exactly the pt value", () => {
    const perUnit = EPS_UNITS_PER_ARTBOARD_UNIT(raster);
    expect(perUnit).toBeCloseTo(raster.width * (72 / 96) / ARTBOARD_UNITS, 6);
    const epsLw = strokeInArtboardUnits(2.2, plan, raster) * perUnit;
    expect(epsLw).toBeCloseTo(2.2, 6);
  });
});
