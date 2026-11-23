// @vitest-environment happy-dom
// builder_export_stroke.test.tsx — bug (2026-11-19): the saved SVG and EPS do
// not paint the stroke the artboard paints. The cell writes the user's px on a
// group that is then SCALED to fit its box, while `vector-effect` on the inner
// shapes does nothing, so the file's own number and its rendering disagree.
// What the user sets is what the file must paint, measured on the real composed
// sheet and on the real EPS program.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { cellGroupOf, iconPreviewSvg } from "../src/lib/svgBuilder/svgAsset";
import { writeEps } from "../src/lib/upload/eps";
import { solidPaint } from "../src/svgBuilder/sheetpackage";
import { expandTextToFills, setTextOutliner } from "../src/lib/upload/expandtext";

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
const asset = { id: "a", label: "A", fingerprint: "f" } as never;
const frame = { index: 0, x: 100, y: 200, size: 80, glyph: 80, captionY: 0, captionSize: 0 };

/** The scale a cell's own transform applies. */
const cellScale = (html: string): number => Number(/scale\(([\d.]+)\)/.exec(html)?.[1] ?? NaN);

describe("the exported stroke is the stroke the artboard paints", () => {
  it("writes the cell's pen in FINAL px, so the file's number is what a viewer draws", () => {
    const style = { ...DEFAULT_CONFIG.icons, strokeWidth: 1 };
    const cell = cellGroupOf({ code: ICON, asset, frame, style });
    expect(cell.ok).toBe(true);
    if (!cell.ok) return;
    const scale = cellScale(cell.html);
    expect(scale).toBeCloseTo(80 / 24, 2); // the icon is fitted 24 → 80
    const written = Number(/stroke-width="([\d.]+)"/.exec(cell.html)?.[1] ?? NaN);
    // the group carries BOTH the transform and the width: a viewer multiplies them,
    // so the WIDTH IT PAINTS must be the user's 1 px.
    expect(written * scale).toBeCloseTo(1, 2);
    expect(written).toBeCloseTo(1 / scale, 2);
    // and the inner shapes must not fight it with a vector-effect that does nothing
    expect(cell.html).not.toContain("non-scaling-stroke");
  });

  it("every user width reaches the sheet unchanged through that scale (1, 1.4, 2.5 px)", () => {
    for (const strokeWidth of [1, 1.4, 2.5]) {
      const cell = cellGroupOf({ code: ICON, asset, frame, style: { ...DEFAULT_CONFIG.icons, strokeWidth } });
      if (!cell.ok) throw new Error(cell.error);
      const painted = Number(/stroke-width="([\d.]+)"/.exec(cell.html)?.[1] ?? NaN) * cellScale(cell.html);
      expect(painted).toBeCloseTo(strokeWidth, 3); // what a viewer really paints, in artboard px
    }
  });

  it("the composed sheet's icon group paints the setting, not a box-scaled stranger", () => {
    const config = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "none" as const }, icons: { ...DEFAULT_CONFIG.icons, strokeWidth: 1 } };
    const doc = composeSheet({ config, layout: computeLayout(config), assets: [asset], placedIds: ["a"], svgTexts: { a: ICON } });
    const group = /<g [^>]*data-asset-id="a"[^>]*>/.exec(doc.svg)?.[0] ?? "";
    const scale = Number(/scale\(([\d.]+)\)/.exec(group)?.[1] ?? NaN);
    const written = Number(/stroke-width="([\d.]+)"/.exec(group)?.[1] ?? NaN);
    expect(written * scale).toBeCloseTo(1, 3);
    expect(doc.svg).not.toContain("non-scaling-stroke");
  });

  it("the EPS program carries the same pen: 1 px setting → 1 px stroke in PostScript", () => {
    const config = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "none" as const, ringStroke: 1 }, icons: { ...DEFAULT_CONFIG.icons, strokeWidth: 1 } };
    const doc = composeSheet({ config, layout: computeLayout(config), assets: [asset], placedIds: ["a"], svgTexts: { a: ICON } });
    setTextOutliner(() => ({ d: "M0 0 L10 0 Z", width: 10 }));
    const outlined = expandTextToFills(solidPaint(doc.svg));
    setTextOutliner(null);
    expect(outlined.ok).toBe(true);
    const eps = writeEps(outlined.ok ? outlined.svg : doc.svg, "#ffffff");
    expect(eps.ok).toBe(true);
    if (!eps.ok) return;
    // The EPS carries the document's own number verbatim...
    const cell = /<g [^>]*data-asset-id="a"[^>]*>/.exec(doc.svg)?.[0] ?? "";
    const written = Number(/stroke-width="([\d.]+)"/.exec(cell)?.[1] ?? NaN);
    const fit = Number(/scale\(([\d.]+)\)/.exec(cell)?.[1] ?? NaN);
    const widths = [...eps.eps.slice(eps.eps.indexOf("%%EndSetup")).matchAll(/([\d.]+) w(?=\s)/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(1);
    expect(widths[0]).toBeCloseTo(written, 2); // the EPS's own 3-decimal number
    // ...and PostScript multiplies it by the cell's own fit and by the document's
    // px→pt 0.75, so the pen the page really paints is the 1 px the editor shows.
    expect(written * fit * 0.75).toBeCloseTo(0.75, 2);
    expect(widths[0]).toBeLessThan(1); // never the verbatim 1 that fit used to multiply
  });

  it("the library tile preview follows the same rule (it shows what the sheet draws)", () => {
    const svg = iconPreviewSvg(ICON, asset, { ...DEFAULT_CONFIG.icons, strokeWidth: 1.5 });
    expect(svg).not.toBeNull();
    expect(svg).not.toContain("non-scaling-stroke");
    // the tile fits a 20 px glyph in a 24 px box, and still paints the user's 1.5 px
    const scale = Number(/scale\(([\d.]+)\)/.exec(svg ?? "")?.[1] ?? NaN);
    expect(scale).toBeCloseTo(20 / 24, 2);
    expect(Number(/stroke-width="([\d.]+)"/.exec(svg ?? "")?.[1] ?? NaN) * scale).toBeCloseTo(1.5, 1);
  });
});
