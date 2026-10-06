// svgup_units.test.ts — the unit rules of the "SVG to upload" tab (design §4 C4/C5).
// The tab lets a human type `2.2 pt`, `12 px` or `5 %`; the SVG and the raster
// both count in user units, so every stored length is converted ONCE, against a
// declared 96-dpi document convention (CSS: 96 px/in, 72 pt/in). Nothing is ever
// an "unexplained px": a length without a unit is refused, and a negative one too.
import { describe, expect, it } from "vitest";
import {
  PT_PER_INCH, PX_PER_INCH, clampPaddingPx, parseLength, ptToPx, toPx,
} from "../src/lib/svgupload/units";

describe("the document unit convention", () => {
  it("declares the CSS resolution both counts are derived from", () => {
    expect(PX_PER_INCH).toBe(96);
    expect(PT_PER_INCH).toBe(72);
    expect(ptToPx(1)).toBeCloseTo(4 / 3, 10); // 96/72 — a point is 1.333 px
  });

  it("converts the example stroke width to a number it can scale against", () => {
    expect(ptToPx(2.2)).toBeCloseTo(2.9333333, 6);
    expect(ptToPx(72)).toBeCloseTo(96, 10); // an inch is an inch
  });
});

describe("parseLength — what a human typed", () => {
  it("reads a value with its unit, any spacing, any case", () => {
    expect(parseLength("2.2 pt")).toEqual({ value: 2.2, unit: "pt" });
    expect(parseLength("2.2pt")).toEqual({ value: 2.2, unit: "pt" });
    expect(parseLength(" 12 PX ")).toEqual({ value: 12, unit: "px" });
    expect(parseLength("5%")).toEqual({ value: 5, unit: "%" });
    expect(parseLength("0pt")).toEqual({ value: 0, unit: "pt" }); // no padding is a choice
  });

  it("refuses a length with no unit and anything that is not a length", () => {
    for (const bad of ["2.2", "pt", "", "  ", "abc", "2.2 em", "1,5 px", "−3 px"]) {
      expect(parseLength(bad)).toBeNull();
    }
  });

  it("refuses a negative length instead of flipping geometry", () => {
    expect(parseLength("-1 pt")).toBeNull();
    expect(parseLength("-0.5px")).toBeNull();
  });
});

describe("toPx — one conversion for both consumers", () => {
  it("converts pt and px directly and a percentage against its basis", () => {
    expect(toPx({ value: 2.2, unit: "pt" }, 100)).toBeCloseTo(2.9333333, 6);
    expect(toPx({ value: 12, unit: "px" }, 100)).toBe(12);
    expect(toPx({ value: 5, unit: "%" }, 200)).toBe(10);
  });

  it("keeps a percentage the same size on both axes of a square basis only", () => {
    // the caller passes the basis it means; a % of a 2:1 artboard is not a % of its height
    expect(toPx({ value: 10, unit: "%" }, 400)).toBe(40);
  });
});

describe("clampPaddingPx — padding can never swallow the artwork", () => {
  it("leaves a sane padding alone and caps one that would collapse the artboard", () => {
    expect(clampPaddingPx(8, 100)).toBe(8);
    expect(clampPaddingPx(0, 100)).toBe(0);
    expect(clampPaddingPx(500, 100)).toBe(45); // 45% of the shorter side, the documented cap
  });
});
