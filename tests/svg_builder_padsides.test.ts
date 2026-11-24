// svg_builder_padsides.test.ts — the icon area's padding per side (2026-11-24):
// one uniform `padding`, or four sides once a single side was dragged.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { padOf, withPadSide } from "../src/lib/svgBuilder/padsides";

const noBanner = (artboard: object) => parseSheetConfig({ ...DEFAULT_CONFIG, artboard: { ...DEFAULT_CONFIG.artboard, ...artboard }, banner: { ...DEFAULT_CONFIG.banner, position: "none" } });

describe("padding per side", () => {
  it("a stored sheet without sides (every older template) pads all four alike", () => {
    const c = parseSheetConfig({ ...DEFAULT_CONFIG, artboard: { width: 800, height: 400, background: "#FFFFFF", padding: 20, radius: 0 } });
    expect(c.artboard.padSides).toBeNull();
    expect(padOf(c.artboard)).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
  });

  it("sides are clamped 0–160; four equal sides fold back into one padding", () => {
    expect(noBanner({ padSides: { top: -5, right: 999, bottom: 10, left: 12 } }).artboard.padSides).toEqual({ top: 0, right: 160, bottom: 10, left: 12 });
    expect(noBanner({ padding: 3, padSides: { top: 9, right: 9, bottom: 9, left: 9 } }).artboard).toMatchObject({ padding: 9, padSides: null });
    expect(noBanner({ padSides: "junk" }).artboard.padSides).toBeNull();
  });

  it("withPadSide: one side, or all four (Shift)", () => {
    const a = noBanner({ padding: 20 }).artboard;
    expect(padOf(withPadSide(a, "left", 50, false))).toEqual({ top: 20, right: 20, bottom: 20, left: 50 });
    expect(withPadSide(a, "left", 50, true)).toMatchObject({ padding: 50, padSides: null });
  });

  it("the layout insets the icon area by each side's own padding", () => {
    const c = noBanner({ width: 800, height: 400, padSides: { top: 10, right: 20, bottom: 30, left: 40 } });
    expect(computeLayout(c).content).toEqual({ x: 40, y: 10, width: 740, height: 360 });
  });
});
