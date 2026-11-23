// export_stroke_width.test.ts — the stroke width the artboard shows must be the
// stroke width the saved files paint (2026-11-19). A 1 px artboard stroke is ONE
// artboard pixel in the saved SVG and in the EPS — not the icon's 24-unit width
// multiplied by the cell's scale, and not pinned to the screen by
// `vector-effect="non-scaling-stroke"` (which the PostScript writer never saw).
import { afterEach, describe, expect, it } from "vitest";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { packageOf, sheetSvg, textOf } from "./helpers/sheetpackage";

afterEach(() => setTextOutliner(null));

/** RULE 26's written precision: one decimal, computed the way the writer does. */
const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

/**
 * Every `stroke-width` in the document with the scale its own `transform`
 * applies — the width a reader actually paints.
 */
function paintedWidths(svg: string, cellsOnly = false): { local: number; scale: number; painted: number }[] {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const all = Array.from(doc.getElementsByTagName("*"));
  return (cellsOnly ? all.filter((el) => el.getAttribute("data-asset-id") !== null) : all)
    .filter((el) => el.getAttribute("stroke-width") !== null)
    .map((el) => {
      const local = Number(el.getAttribute("stroke-width"));
      const match = /scale\(([\d.]+)\)/.exec(el.getAttribute("transform") ?? "");
      const scale = match === null ? 1 : Number(match[1]);
      return { local, scale, painted: local * scale };
    });
}

/** The widths the artwork's strokes really set (`w` in the prolog) — the setup's default is not one of them. */
const penWidths = (eps: string): string[] =>
  [...eps.slice(eps.indexOf("%%EndSetup")).matchAll(/([\d.]+) w(?=\s)/g)].map((match) => match[1]).sort();

describe("the saved SVG paints the artboard's stroke width", () => {
  it.each([1, 1.4, 2.5])("a %s px artboard stroke is that many units in the composed sheet", (px) => {
    const widths = paintedWidths(sheetSvg({ strokeWidth: px }), true);
    const hero = DEFAULT_CONFIG.banner.heroStroke;
    expect(widths.length).toBeGreaterThan(0);
    // Every cell paints one of the two widths the artboard's settings name...
    for (const width of widths) expect([px, hero].some((want) => Math.abs(width.painted - want) < 0.005)).toBe(true);
    // ...and the icon cells (not the enlarged hero) paint exactly the setting.
    expect(widths.filter((width) => Math.abs(width.painted - px) < 0.005).length).toBeGreaterThan(0);
  });

  it("keeps no non-scaling stroke that a plainer consumer would ignore", () => {
    expect(sheetSvg({ strokeWidth: 1 })).not.toContain("non-scaling-stroke");
  });
});

describe("the saved EPS strokes with the same pen as the SVG", () => {
  it("writes each setlinewidth in the same local space as the SVG's stroke-width", async () => {
    const svg = sheetSvg({ strokeWidth: 1 });
    setTextOutliner(() => ({ d: "M0 0 L10 0", width: 10 }));
    const pkg = await packageOf(svg, { includeEps: true, expandText: true });
    expect(pkg.problems).toEqual([]);
    const eps = textOf(pkg, ".eps");
    expect(eps).not.toBeNull();
    // Every width the document really paints — RULE 26 leaves no transform to
    // multiply it by. The body writes only CHANGES, so a pen equal to the setup
    // default is not restated unless an earlier pen moved the state away from it
    // (a 1 px cell after a 1.1 px hero does). What must hold is: no width the
    // SVG never paints, and every width it does paint (but the default).
    const painted = [...new Set(paintedWidths(svg).map((width) => width.local))].map(String);
    const written = [...new Set(penWidths(eps as string))];
    for (const width of written) expect(painted).toContain(width);
    for (const width of painted.filter((width) => width !== "1")) expect(written).toContain(width);
  });
});

describe("expanding strokes bakes the artboard's own pen into the outline", () => {
  it("grows each cell outline by exactly half the pen it carried", async () => {
    const svg = sheetSvg({ strokeWidth: 1 });
    setTextOutliner(() => ({ d: "M0 0 L10 0", width: 10 }));
    const pkg = await packageOf(svg, { expandText: true, expandStrokes: true });
    expect(pkg.problems).toEqual([]);
    const out = textOf(pkg, ".svg") as string;
    expect(out).not.toContain("stroke-width");
    expect(out).not.toContain("vector-effect");
    const pens = paintedWidths(svg, true).map((width) => width.local);
    const origTops = [...svg.matchAll(/data-asset-id="[^"]+"[\s\S]*?<path d="M([\d.]+) ([\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    expect(origTops.length).toBe(pens.length);
    origTops.forEach((orig, index) => {
      const match = new RegExp(`<path[^>]*d="M${orig.x} ([\\d.]+)`).exec(out);
      expect(match).not.toBeNull();
      // The outline grows by pen/2 and the result is written at one decimal, so
      // both sides of the comparison are computed the way the file computes them.
      const grown = oneDecimal(orig.y - pens[index] / 2);
      expect(Number(match![1])).toBeCloseTo(grown, 1);
    });
  });
});
