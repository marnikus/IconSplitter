// svgup_geom.test.ts — the scene parser and stroke-aware visible bounds execute
// for real (RULE 8): shapes, nested transforms, the minimal CSS cascade, the
// stroke-expansion policy (caps, round joins, miter joins with the miterlimit
// cap), unsupported-feature tracking for EPS preflight, and honest empty
// scenes. Deleting the module fails every assertion here.
import { describe, expect, it } from "vitest";
import { IDENTITY, applyMatrix, multiply, parseTransform } from "../src/lib/svgupload/geom/matrix";
import { colorToRgb, normalizeColorRef } from "../src/lib/svgupload/geom/color";
import { parseScene, type GeomScene } from "../src/lib/svgupload/geom/scene";
import { sceneBounds } from "../src/lib/svgupload/geom/bounds";

const expectMatrix = (got: number[], want: number[]): void => {
  got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 6));
};

const parse = (svg: string): GeomScene => {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return parseScene(doc);
};

const STROKED_SQUARE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M 4 4 L 20 4 L 20 20 L 4 20 Z" fill="none" stroke="#000000" stroke-width="2"/>
</svg>`;

describe("geom/matrix — transforms", () => {
  it("parses every transform form", () => {
    expect(parseTransform("translate(5, 6)")).toEqual([1, 0, 0, 1, 5, 6]);
    expect(parseTransform("translate(5)")).toEqual([1, 0, 0, 1, 5, 0]);
    expect(parseTransform("scale(2, 3)")).toEqual([2, 0, 0, 3, 0, 0]);
    expect(parseTransform("scale(2)")).toEqual([2, 0, 0, 2, 0, 0]);
    expectMatrix(parseTransform("rotate(90, 10, 10)"), [0, 1, -1, 0, 20, 0]);
    expect(parseTransform("matrix(1,2,3,4,5,6)")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseTransform("")).toEqual(IDENTITY);
    expect(parseTransform("bogus(1)")).toEqual(IDENTITY);
    expectMatrix(parseTransform("rotate(90)"), [0, 1, -1, 0, 0, 0]);
  });

  it("multiplies and applies like the SVG rendering model", () => {
    const m = multiply(parseTransform("translate(10,0)"), parseTransform("scale(2)"));
    expect(applyMatrix(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 2 });
  });
});

describe("geom/color — colour parsing", () => {
  it("parses hex, rgb() and the common names EPS needs", () => {
    expect(normalizeColorRef("#fff")).toBe("#ffffff");
    expect(colorToRgb("#1e7f3c")).toEqual({ r: 0x1e / 255, g: 0x7f / 255, b: 0x3c / 255 });
    expect(colorToRgb("rgb(255, 128, 0)")).toEqual({ r: 1, g: 128 / 255, b: 0 });
    expect(colorToRgb("black")).toEqual({ r: 0, g: 0, b: 0 });
    expect(colorToRgb("WHITE")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("is honest about what it cannot parse (never a guessed colour)", () => {
    expect(colorToRgb("url(#gradient)")).toBeNull();
    expect(colorToRgb("currentColor")).toBeNull();
    expect(colorToRgb("no-such-color")).toBeNull();
  });
});

describe("geom/scene — the scene", () => {
  it("parses shapes, inherited strokes and per-element transforms", () => {
    const scene = parse(`<svg xmlns="http://www.w3.org/2000/svg">
      <g stroke="#123456" stroke-width="1.5" fill="none">
        <rect x="2" y="2" width="10" height="6"/>
        <circle cx="20" cy="5" r="4" transform="translate(3,0)"/>
        <line x1="0" y1="30" x2="40" y2="30"/>
      </g>
    </svg>`);
    expect(scene.shapes).toHaveLength(3);
    const line = scene.shapes[2];
    expect(line.stroke).toBe("#123456");
    expect(line.strokeWidth).toBe(1.5);
    expect(applyMatrix(line.matrix, { x: 0, y: 30 })).toEqual({ x: 0, y: 30 });
    const circle = scene.shapes[1];
    expect(applyMatrix(circle.matrix, { x: 20, y: 5 })).toEqual({ x: 23, y: 5 });
  });

  it("applies the minimal class/tag CSS cascade, CSS over attributes", () => {
    const scene = parse(`<svg xmlns="http://www.w3.org/2000/svg">
      <style>.cls-1{fill:none;stroke:#9f9f9f;stroke-width:3.25;stroke-linejoin:round} line{stroke-linecap:round}</style>
      <path class="cls-1" d="M0 0L9 9" stroke="#010101"/>
      <line x1="1" y1="1" x2="2" y2="2"/>
    </svg>`);
    const path = scene.shapes[0];
    expect(path.stroke).toBe("#9f9f9f"); // CSS rules override presentation attributes (SVG spec)
    expect(path.strokeWidth).toBe(3.25); // CSS fills what the attribute omits
    expect(path.linejoin).toBe("round");
    expect(scene.shapes[1].linejoin).toBe("miter"); // the line rule matched the LINE element only
  });

  it("tracks unsupported features instead of pretending to draw them", () => {
    const scene = parse(`<svg xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>
      <text x="1" y="2">hi</text>
      <image href="x.png" x="0" y="0" width="4" height="4"/>
      <path d="M0 0L5 5" stroke="url(#g)" fill="none"/>
    </svg>`);
    expect([...scene.unsupported].sort()).toEqual(["gradient", "image", "text"]);
  });
});

describe("geom/scene — visible bounds, stroke included", () => {
  it("expands by sw/2 for round joins and caps (exact policy)", () => {
    const scene = parse(STROKED_SQUARE.replace("stroke-width=\"2\"", "stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\""));
    const b = sceneBounds(scene);
    expect(b).not.toBeNull();
    expect(b?.minX).toBeCloseTo(3, 6);
    expect(b?.maxX).toBeCloseTo(21, 6);
    expect(b?.minY).toBeCloseTo(3, 6);
    expect(b?.maxY).toBeCloseTo(21, 6);
  });

  it("expands miter joins by sw/2/sin(theta/2), capped by the miterlimit", () => {
    // right-angle corners: extent = sw/2 * sqrt(2) = 1.414…
    const scene = parse(STROKED_SQUARE);
    const b = sceneBounds(scene);
    expect(b?.minX).toBeCloseTo(4 - Math.SQRT2, 3);
    // a sharp 30° corner would exceed the cap: miterlimit (4) clamps it
    const sharp = parse(`<svg xmlns="http://www.w3.org/2000/svg">
      <path d="M 5 5 L 25 5 L 6.34 6.34 Z" fill="none" stroke="#000" stroke-width="2" stroke-miterlimit="4"/>
    </svg>`);
    const sb = sceneBounds(sharp);
    expect(sb?.maxY).toBeCloseTo(6.34 + 4, 2); // sw/2 * miterlimit = 4 beyond the joint
  });

  it("scales the stroke expansion with the element transform", () => {
    const scene = parse(`<svg xmlns="http://www.w3.org/2000/svg">
      <path d="M 0 0 L 10 0" stroke="#000" stroke-width="2" fill="none" transform="scale(3)"/>
    </svg>`);
    const b = sceneBounds(scene);
    expect(b?.minY).toBeCloseTo(-3, 6);   // sw 2 × scale 3, expanded by sw'/2
    expect(b?.maxX).toBeCloseTo(33, 6);
  });

  it("a scene with no drawable geometry is honestly empty (RULE 4)", () => {
    expect(sceneBounds(parse(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`))).toBeNull();
    const none = parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1" stroke="none" fill="none"/></svg>`);
    expect(sceneBounds(none)).toBeNull();
  });

  it("approximates text with an em box and marks it unsupported", () => {
    const scene = parse(`<svg xmlns="http://www.w3.org/2000/svg"><text x="2" y="10" font-size="8">Hello</text></svg>`);
    const b = sceneBounds(scene);
    expect(b?.minX).toBeCloseTo(2, 6);
    expect(b?.maxX).toBeCloseTo(2 + 5 * 8 * 0.6, 6);
    expect(scene.unsupported).toContain("text");
  });
});
