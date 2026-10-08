// upload_outline.test.ts — the ONE outline model every shape compiles to
// (2026-10-08, exact stroke width): shapes and the full path grammar as
// absolute move/line/cubic/close ops, an affine transform over them, and the
// SVG `d` writer. The EPS writer and the geometry bake both read this model.

import { describe, expect, it } from "vitest";
import { outlineToPathData, pathOutline, shapeOutline, transformOutline, type Outline } from "../src/lib/upload/geom/outline";
import { parseTransform } from "../src/lib/upload/geom/matrix";

function el(markup: string): Element {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, "image/svg+xml");
  return doc.documentElement.firstElementChild as Element;
}

const ops = (o: Outline | null) => (o === null ? null : o.ops.map((op) => op.op).join(""));

describe("shapeOutline — every shape of the subset as ops", () => {
  it("rect → four lines closed; a rounded rect is outside the model", () => {
    const o = shapeOutline(el(`<rect x="1" y="2" width="4" height="3"/>`));
    expect(ops(o)).toBe("MLLLZ");
    expect(outlineToPathData(o as Outline)).toBe("M1 2L5 2L5 5L1 5Z");
    expect(shapeOutline(el(`<rect x="1" y="2" width="4" height="3" rx="1"/>`))).toBeNull();
    expect(shapeOutline(el(`<rect x="1" y="2" width="0" height="3"/>`))).toBeNull();
  });

  it("circle and ellipse → four cubics, closed", () => {
    const circle = shapeOutline(el(`<circle cx="10" cy="10" r="4"/>`));
    expect(ops(circle)).toBe("MCCCCZ");
    expect(outlineToPathData(circle as Outline).startsWith("M14 10C14 12.209 12.209 14 10 14")).toBe(true);
    expect(ops(shapeOutline(el(`<ellipse cx="30" cy="10" rx="6" ry="3"/>`)))).toBe("MCCCCZ");
    expect(shapeOutline(el(`<circle cx="10" cy="10" r="0"/>`))).toBeNull();
  });

  it("line, polyline, polygon → lines (the polygon closed)", () => {
    expect(outlineToPathData(shapeOutline(el(`<line x1="1" y1="1" x2="9" y2="9"/>`)) as Outline)).toBe("M1 1L9 9");
    expect(outlineToPathData(shapeOutline(el(`<polyline points="1,1 5,5 9,1"/>`)) as Outline)).toBe("M1 1L5 5L9 1");
    expect(outlineToPathData(shapeOutline(el(`<polygon points="1,1 5,5 9,1"/>`)) as Outline)).toBe("M1 1L5 5L9 1Z");
    expect(shapeOutline(el(`<polyline points="1,1 5"/>`))).toBeNull();
  });

  it("path → its data; anything else is not a shape", () => {
    expect(ops(shapeOutline(el(`<path d="M0 0 L1 1"/>`)))).toBe("ML");
    expect(shapeOutline(el(`<path d=""/>`))).toBeNull();
    expect(shapeOutline(el(`<g/>`))).toBeNull();
    expect(shapeOutline(el(`<text x="1" y="1">hi</text>`))).toBeNull();
  });
});

describe("pathOutline — the full grammar, absolute and relative", () => {
  it("M/L/H/V/Z with relative forms and a second subpath", () => {
    const o = pathOutline("M10 10 L20 20 H30 V5 Z M40 40 l5 5 m10 0 h10 v10 z");
    expect(outlineToPathData(o as Outline)).toBe("M10 10L20 20L30 20L30 5ZM40 40L45 45M55 45L65 45L65 55Z");
  });

  it("C/S lift the smooth control from the previous cubic; Q/T lift to cubics", () => {
    const o = pathOutline("M0 0 C1 1 2 2 3 3 S5 5 6 6 Q7 7 8 8 T10 10");
    expect(ops(o)).toBe("MCCCC");
    const d = outlineToPathData(o as Outline);
    expect(d).toContain("C1 1 2 2 3 3C4 4 5 5 6 6"); // S reflects (2,2) about (3,3) → (4,4)
    expect(d).toContain("C6.667 6.667 7.333 7.333 8 8"); // Q at 2/3 along the legs
  });

  it("A replays as ≤90° cubics; a zero radius is a straight line", () => {
    const quarter = pathOutline("M10 0 A10 10 0 0 1 0 10");
    expect(ops(quarter)).toBe("MC");
    const d = outlineToPathData(quarter as Outline);
    expect(d).toMatch(/^M10 0C10 5\.52\d? 5\.52\d? 10 0 10$/);
    expect(ops(pathOutline("M0 0 A20 20 0 1 1 0 0.001"))).toBe("MCCCC"); // a near-full sweep
    expect(outlineToPathData(pathOutline("M0 0 A0 5 0 0 1 3 3") as Outline)).toBe("M0 0L3 3");
  });

  it("null for empty or command-less data", () => {
    expect(pathOutline(null)).toBeNull();
    expect(pathOutline("   ")).toBeNull();
  });
});

describe("transformOutline — an affine map over every point (controls included)", () => {
  it("translate + uniform scale", () => {
    const o = transformOutline(pathOutline("M1 1 L3 1 C3 2 2 3 1 3 Z") as Outline, parseTransform("translate(10 20) scale(2)"));
    expect(outlineToPathData(o)).toBe("M12 22L16 22C16 24 14 26 12 26Z");
  });

  it("a 90° rotation keeps the shape exact, 3 decimals in the writer", () => {
    const o = transformOutline(pathOutline("M1 0 L0 1") as Outline, parseTransform("rotate(90)"));
    expect(outlineToPathData(o)).toBe("M0 1L-1 0");
  });
});
