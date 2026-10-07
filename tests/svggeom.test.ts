// svggeom.test.ts — the geometry the export depends on (RULE 8). Every expected
// box below is hand-computed from the SVG specification, including the curve
// extrema (a cubic does NOT reach its control points) and the arc extrema.
import { describe, expect, it } from "vitest";
import {
  intersectBox, pathBox, shapeBox, strokeBox, unionBox, transformBox, type StrokeStyle,
} from "../src/lib/svggeom";
import { applyMatrix, multiply, parseTransform, scaleOf, transformOf } from "../src/lib/svgtransform";

const attrs = (map: Record<string, string>) => (name: string) => map[name] ?? null;

describe("svgtransform", () => {
  it("reads a transform list left to right (first function outermost)", () => {
    const m = parseTransform("translate(10 5) scale(2)");
    expect(applyMatrix(m, { x: 0, y: 0 })).toEqual({ x: 10, y: 5 });
    expect(applyMatrix(m, { x: 3, y: 0 })).toEqual({ x: 16, y: 5 });
  });

  it("rotates about a centre when one is given", () => {
    const m = parseTransform("rotate(90 5 5)");
    const p = applyMatrix(m, { x: 5, y: 0 });
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.y).toBeCloseTo(5, 6);
  });

  it("ignores unknown functions and empty lists", () => {
    expect(parseTransform("wobble(3)")).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform(null)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform("")).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("reads the element's transform: an inline style REPLACES the attribute", () => {
    const el = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(2 0)" style="opacity:1; transform: scale(3)"/></svg>',
      "image/svg+xml",
    ).querySelector("g")!;
    expect(applyMatrix(transformOf(el), { x: 1, y: 0 })).toEqual({ x: 3, y: 0 });
  });

  it("uses the attribute when there is no declaration", () => {
    const el = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(2 3)"/></svg>',
      "image/svg+xml",
    ).querySelector("g")!;
    expect(applyMatrix(transformOf(el), { x: 0, y: 0 })).toEqual({ x: 2, y: 3 });
  });

  it("reports the scale a stroke is multiplied by", () => {
    expect(scaleOf(parseTransform("scale(2)"))).toBeCloseTo(2, 6);
    expect(scaleOf(parseTransform("scale(2 4)"))).toBeCloseTo(3, 6);
    expect(scaleOf(multiply(parseTransform("scale(2)"), parseTransform("translate(9 9)")))).toBeCloseTo(2, 6);
  });
});

describe("shape boxes", () => {
  it("reads the primitive shapes", () => {
    expect(shapeBox("rect", attrs({ x: "2", y: "3", width: "10", height: "4" }))).toEqual({ x: 2, y: 3, w: 10, h: 4 });
    expect(shapeBox("circle", attrs({ cx: "5", cy: "5", r: "5" }))).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(shapeBox("ellipse", attrs({ cx: "5", cy: "5", rx: "3", ry: "2" }))).toEqual({ x: 2, y: 3, w: 6, h: 4 });
    expect(shapeBox("line", attrs({ x1: "10", y1: "0", x2: "0", y2: "4" }))).toEqual({ x: 0, y: 0, w: 10, h: 4 });
    expect(shapeBox("polygon", attrs({ points: "0,0 4,0 4,6" }))).toEqual({ x: 0, y: 0, w: 4, h: 6 });
  });

  it("returns null for a shape that draws nothing", () => {
    expect(shapeBox("rect", attrs({ width: "0", height: "4" }))).toBeNull();
    expect(shapeBox("circle", attrs({ r: "0" }))).toBeNull();
    expect(shapeBox("", attrs({}))).toBeNull();
    expect(pathBox("")).toBeNull();
  });
});

describe("path boxes", () => {
  it("measures straight segments and a close", () => {
    expect(pathBox("M0 0 L10 0 L10 5 Z")).toEqual({ x: 0, y: 0, w: 10, h: 5 });
    expect(pathBox("m1 1 h4 v2 h-4 z")).toEqual({ x: 1, y: 1, w: 4, h: 2 });
  });

  it("measures a cubic's real extrema, not its control points", () => {
    const box = pathBox("M0 0 C0 10 10 10 10 0");
    expect(box).toMatchObject({ x: 0, y: 0, w: 10 });
    expect(box?.h).toBeCloseTo(7.5, 6);
  });

  it("measures a quadratic", () => {
    const box = pathBox("M0 0 Q5 10 10 0");
    expect(box?.h).toBeCloseTo(5, 6);
  });

  it("measures an elliptical arc's extreme, not only its end points", () => {
    const box = pathBox("M0 0 A5 5 0 0 1 10 0");
    expect(box?.w).toBeCloseTo(10, 6);
    expect(box?.y).toBeCloseTo(-5, 6);
    expect(box?.h).toBeCloseTo(5, 6);
  });

  it("treats a degenerate arc as the line it really is", () => {
    expect(pathBox("M0 0 A0 0 0 0 1 4 4")).toEqual({ x: 0, y: 0, w: 4, h: 4 });
  });

  it("follows a smooth continuation's mirrored control point", () => {
    const box = pathBox("M0 0 C0 10 10 10 10 0 S20 -10 20 0");
    expect(box?.x).toBe(0);
    expect(box?.w).toBeCloseTo(20, 6);
  });

  it("ignores a trailing partial command instead of inventing geometry", () => {
    expect(pathBox("M0 0 L10")).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("stroke boxes", () => {
  const stroke = (over: Partial<StrokeStyle> = {}): StrokeStyle =>
    ({ width: 4, cap: "butt", join: "miter", miterLimit: 4, nonScaling: false, ...over });

  it("adds half the width on every side", () => {
    expect(strokeBox({ x: 0, y: 0, w: 10, h: 10 }, stroke({ join: "round" }))).toEqual({ x: -2, y: -2, w: 14, h: 14 });
  });

  it("gives a square cap its diagonal reach", () => {
    // width 4 -> half is 2, a square cap reaches 2·√2 per side, so 4·√2 across.
    const box = strokeBox({ x: 0, y: 0, w: 0, h: 0 }, stroke({ cap: "square", join: "round" }));
    expect(box.w).toBeCloseTo(4 * Math.SQRT2, 6);
  });

  it("scales the width by the element's matrix, unless it is non-scaling", () => {
    const m = parseTransform("scale(3)");
    expect(strokeBox({ x: 0, y: 0, w: 0, h: 0 }, stroke({ join: "round" }), m).w).toBeCloseTo(12, 6);
    expect(strokeBox({ x: 0, y: 0, w: 0, h: 0 }, stroke({ join: "round", nonScaling: true }), m).w).toBeCloseTo(4, 6);
  });

  it("leaves the box alone when nothing is stroked", () => {
    expect(strokeBox({ x: 1, y: 1, w: 2, h: 2 }, stroke({ width: 0 }))).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });
});

describe("box algebra", () => {
  it("unions and transforms boxes", () => {
    expect(unionBox([{ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: -1, w: 1, h: 1 }])).toEqual({ x: 0, y: -1, w: 6, h: 2 });
    expect(unionBox([])).toBeNull();
    expect(transformBox({ x: 0, y: 0, w: 2, h: 2 }, parseTransform("rotate(90)"))).toMatchObject({ w: 2, h: 2 });
  });

  it("intersects, and says so when there is nothing left", () => {
    expect(intersectBox({ x: 0, y: 0, w: 4, h: 4 }, { x: 2, y: 2, w: 4, h: 4 })).toEqual({ x: 2, y: 2, w: 2, h: 2 });
    expect(intersectBox({ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 })).toBeNull();
  });
});
