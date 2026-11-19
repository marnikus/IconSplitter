// export_stroke_color.test.ts — the ink the artboard (or a template) sets must
// be the ink the saved files carry (2026-11-19). The composed sheet draws cells
// as `stroke="currentColor"` + `color="#…"` so the stage can recolour cheaply;
// that inheritance ended at the preview: the saved SVG left `currentColor`
// behind (Illustrator and every plainer consumer paint it black), and the
// optimizer rewrote hex to CSS names (`orange`), which the EPS writer cannot
// read. Every saved file now carries the concrete hex.
import { afterEach, describe, expect, it } from "vitest";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { packageOf, sheetSvg, textOf } from "./helpers/sheetpackage";

afterEach(() => setTextOutliner(null));

const paintValues = (svg: string): string[] =>
  [...svg.matchAll(/\b(stroke|fill|color)="([^"]+)"/g)].map((match) => match[2]).filter((value) => value !== "none");

/** `#f00` and `#ff0000` are the same ink; the optimizer may shorten a hex. */
const inkOf = (value: string): string => {
  const hex = value.toLowerCase();
  return hex.length === 4 && hex.startsWith("#") ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
};

/** A saved file may only name a colour as hex — never as `currentColor` or a CSS name. */
function expectLiteralInk(svg: string): void {
  for (const value of paintValues(svg)) expect(value, "paint in the saved file").toMatch(/^#[0-9a-f]{3,8}$/i);
}

describe("the saved sheet uses the artboard's ink", () => {
  it("turns every currentColor into the ink the panel set — optimized or not", async () => {
    for (const optimizeSvg of [false, true]) {
      const pkg = await packageOf(sheetSvg({ ink: "#ff0000" }), { optimizeSvg });
      const svg = textOf(pkg, ".svg") as string;
      expect(svg).not.toContain("currentColor");
      expectLiteralInk(svg);
      expect(paintValues(svg).map(inkOf)).toContain("#ff0000");
    }
  });

  it("keeps the ink when strokes become fills", async () => {
    setTextOutliner(() => ({ d: "M0 0 L10 0", width: 10 }));
    const pkg = await packageOf(sheetSvg({ ink: "#ff0000" }), { expandText: true, expandStrokes: true, optimizeSvg: true });
    const svg = textOf(pkg, ".svg") as string;
    expect(pkg.problems).toEqual([]);
    expect(svg).not.toContain("currentColor");
    expectLiteralInk(svg);
    expect(paintValues(svg).map(inkOf)).toContain("#ff0000");
  });

  it("hands the EPS the same ink as real RGB", async () => {
    setTextOutliner(() => ({ d: "M0 0 L10 0", width: 10 }));
    const pkg = await packageOf(sheetSvg({ ink: "#ff0000" }), { includeEps: true, expandText: true });
    const eps = textOf(pkg, ".eps");
    expect(pkg.problems).toEqual([]);
    expect(eps).not.toBeNull();
    expect(eps as string).toContain("1 0 0 setrgbcolor");
  });

  it("never asks the EPS writer to read a CSS colour name the optimizer invented", async () => {
    // #ffa500 is exactly `orange`: SVGO's default would emit the NAME.
    setTextOutliner(() => ({ d: "M0 0 L10 0", width: 10 }));
    const pkg = await packageOf(sheetSvg({ ink: "#ffa500" }), { includeEps: true, expandText: true, optimizeSvg: true });
    const svg = textOf(pkg, ".svg") as string;
    expect(pkg.problems).toEqual([]);
    expectLiteralInk(svg);
    expect(textOf(pkg, ".eps")).not.toBeNull();
  });
});
