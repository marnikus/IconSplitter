// svgup_epswrite.test.ts — the LOCAL EPS writer (merge report §3.2, §9).
// What is proven here, line by line, is the contract the file states about
// itself: the page is the artboard at 96 dpi, a configured 2.2 pt stroke is
// written as `2.2 setlinewidth` for unit-scale artwork, the path operators are
// real PostScript (y flipped, quadratics elevated, even-odd fills, dashes), and
// everything the subset cannot draw is NAMED instead of approximated. The
// converter path is NOT involved: this file must be writable offline.
import { describe, expect, it } from "vitest";
import { EPS_DPI, POINTS_PER_UNIT, epsPage, epsPreflight, writeEps } from "../src/lib/svgupload/epswrite";
import { parseScene, type GeomScene } from "../src/lib/svgupload/geom/scene";
import { ptToPx, pxToPt } from "../src/lib/svgupload/units";

const scene = (svg: string): GeomScene => parseScene(new DOMParser().parseFromString(svg, "image/svg+xml"));

/** A 1000-unit artboard whose single square is drawn with a 0.75-unit stroke. */
const SQUARE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
  <rect x="0" y="0" width="1000" height="1000" fill="#f0f0f0"/>
  <path d="M 100 100 L 900 100 L 900 900 L 100 900 Z" fill="#ffffff" stroke="#101010" stroke-width="0.75"/>
</svg>`;

/** The override the planner would apply for a 2.2 pt stroke on that artboard. */
const OVERRIDE = { width: ptToPx(2.2), pt: 2.2 };

function epsOf(svg: string, stroke: typeof OVERRIDE | null = OVERRIDE): string {
  const out = writeEps({ scene: scene(svg), artboard: { w: 1000, h: 1000 }, stroke, title: "Icon" });
  if (typeof out !== "string") throw new Error(`refused: ${out.error}`);
  return out;
}

describe("the EPS page is the artboard at 96 dpi (§9)", () => {
  it("converts artboard units to PostScript points at 72/96", () => {
    expect(EPS_DPI).toBe(96);
    expect(POINTS_PER_UNIT).toBeCloseTo(0.75, 12);
    const page = epsPage({ w: 1000, h: 500 });
    expect(page.width).toBeCloseTo(750, 9);
    expect(page.height).toBeCloseTo(375, 9);
    expect(ptToPx(2.2)).toBeCloseTo(2.9333, 4); // 2.2 pt is 2.9333 px at 96 dpi
    expect(pxToPt(ptToPx(2.2))).toBeCloseTo(2.2, 9); // and back again
  });

  it("emits a genuine EPSF-3.0 header with integer and hi-res bounding boxes", () => {
    const eps = epsOf(SQUARE);
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(eps).toContain("%%BoundingBox: 0 0 750 750");
    expect(eps).toContain("%%HiResBoundingBox: 0 0 750 750");
    expect(eps).toContain("%%LanguageLevel: 2");
    expect(eps.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(eps).toContain("showpage");
  });

  it("writes the configured stroke as exactly its pt value", () => {
    expect(epsOf(SQUARE)).toContain("2.2 setlinewidth");
  });

  it("flips SVG's top-left origin to PostScript's bottom-left one", () => {
    const eps = epsOf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
      <path d="M 0 0 L 750 0" fill="none" stroke="#000" stroke-width="1"/>
    </svg>`, null);
    expect(eps).toContain("0 750 moveto"); // (0, 0) is the TOP corner: y = 750 pt
    expect(eps).toContain("562.5 750 lineto"); // x 750 units = 562.5 pt
  });
});

describe("the geometry becomes real PostScript (§3.2, no rasterization)", () => {
  it("draws fills and strokes with the configured colours", () => {
    const eps = epsOf(SQUARE);
    expect(eps).toContain("newpath");
    expect(eps).toContain("moveto");
    expect(eps).toContain("lineto");
    expect(eps).toContain("closepath");
    expect(eps).toContain("0.941 0.941 0.941 setrgbcolor"); // #f0f0f0 background rect
    expect(eps).toContain("0.063 0.063 0.063 setrgbcolor"); // #101010 stroke
    expect(eps).toContain("0 setlinejoin"); // the default miter join, stated
    expect(eps).toContain("stroke");
  });

  it("elevates quadratics to cubics and honours even-odd fills and dashes", () => {
    const eps = epsOf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
      <path d="M 100 100 Q 500 900 900 100 Z" fill="#333333" fill-rule="evenodd"/>
      <path d="M 100 500 L 900 500" fill="none" stroke="#111" stroke-width="0.75" stroke-dasharray="10 6"/>
    </svg>`);
    expect(eps).toContain("curveto");
    expect(eps).toContain("eofill");
    expect(eps).toContain("[7.5 4.5] 0 setdash"); // the dash, in points
    expect(eps).toContain("0 setlinecap"); // the SVG default: butt
  });

  it("stacks the fill under the stroke for a shape that is both", () => {
    const eps = epsOf(SQUARE);
    expect(eps.indexOf("gsave")).toBeLessThan(eps.indexOf("fill"));
    expect(eps).toContain("grestore");
  });

  it("states caps and joins as the SVG declares them", () => {
    const eps = epsOf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <path d="M 1 1 L 9 9" fill="none" stroke="#000" stroke-width="1" stroke-linecap="round" stroke-linejoin="bevel"/>
    </svg>`, null);
    expect(eps).toContain("1 setlinecap");
    expect(eps).toContain("2 setlinejoin");
  });

  it("exempts vector-effect non-scaling-stroke from the override, as the copy does", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
      <path d="M 100 100 L 900 100" fill="none" stroke="#000" stroke-width="4" vector-effect="non-scaling-stroke" transform="scale(2)"/>
    </svg>`;
    // 4 units × 0.75 = 3 pt: the element's own scale(2) does not touch it.
    expect(epsOf(svg)).toContain("3 setlinewidth");
  });

  it("scales an element's own transform into the printed width", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
      <path d="M 1 1 L 2 2" fill="none" stroke="#000" stroke-width="1" transform="translate(10 10) scale(2)"/>
    </svg>`;
    // 1 unit × scale 2 × 0.75 = 1.5 pt (the override is not applied here).
    expect(epsOf(svg, null)).toContain("1.5 setlinewidth");
  });
});

describe("preflight names what the writer will not draw (§3.2 honest refusal)", () => {
  it("names gradients, text, images and empty scenes", () => {
    const rich = scene(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>
      <text x="1" y="2">hi</text>
      <image href="x.png" x="0" y="0" width="4" height="4"/>
      <path d="M0 0L5 5" fill="url(#g)"/>
    </svg>`);
    expect(epsPreflight(rich)).toEqual(["gradient", "image", "text"]);
    const refused = writeEps({ scene: rich, artboard: { w: 24, h: 24 }, stroke: null, title: "Icon" });
    expect(typeof refused).not.toBe("string");
    expect((refused as { error: string }).error).toContain("unsupported for EPS");
    expect((refused as { error: string }).error).toContain("text");
  });

  it("says an empty document has nothing to draw instead of writing a blank page", () => {
    const empty = scene(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>`);
    expect(epsPreflight(empty)).toEqual(["nothing-to-draw"]);
    expect(writeEps({ scene: empty, artboard: { w: 24, h: 24 }, stroke: null, title: "Icon" })).toMatchObject({ error: expect.stringContaining("nothing-to-draw") });
  });

  it("refuses a stroke override that is not a positive width", () => {
    const out = writeEps({ scene: scene(SQUARE), artboard: { w: 1000, h: 1000 }, stroke: { width: 0, pt: 0 }, title: "Icon" });
    expect(out).toMatchObject({ error: expect.stringContaining("positive width") });
  });

  it("writes the title as an ASCII PostScript comment", () => {
    const out = writeEps({ scene: scene(SQUARE), artboard: { w: 1000, h: 1000 }, stroke: OVERRIDE, title: "Grid (A) ü" });
    expect(out as string).toContain("%%Title: Grid \\(A\\) ?");
  });
});
