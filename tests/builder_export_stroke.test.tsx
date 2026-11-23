// @vitest-environment happy-dom
// builder_export_stroke.test.tsx — bug (2026-11-19), re-pinned for RULE 26
// (2026-11-23): the saved SVG and EPS must paint the stroke the artboard
// paints. Where this test used to read a `scale(...)` wrapper and multiply, the
// file now carries DIRECT artboard coordinates at ≤ 1 decimal and a
// `stroke-width` that is already the printed px — so the assertion is simply
// "the number in the file is the number the user set", with no transform left
// to reason about. What the user sets is what the file must paint, measured on
// the real composed sheet and on the real EPS program.
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

/** The pen a group writes, as the file states it. */
const penOf = (html: string): number => Number(/stroke-width="([\d.]+)"/.exec(html)?.[1] ?? NaN);

describe("the exported stroke is the stroke the artboard paints", () => {
  it("writes the cell's pen in FINAL px, and no transform to scale it by", () => {
    const style = { ...DEFAULT_CONFIG.icons, strokeWidth: 1 };
    const cell = cellGroupOf({ code: ICON, asset, frame, style });
    expect(cell.ok).toBe(true);
    if (!cell.ok) return;
    // RULE 26: the fit is in the coordinates, so the width is the width.
    expect(cell.html).not.toContain("transform=");
    expect(cell.html).not.toContain("scale(");
    expect(penOf(cell.html)).toBeCloseTo(1, 3);
    // The icon's own 16-unit square, written as numbers: 16 × 80/24 ≈ 53.3 px
    // (the fit rounded to one decimal, as RULE 26 asks of every coordinate).
    const width = Number(/d="M[\d.]+ [\d.]+h([\d.]+)/.exec(cell.html)?.[1]);
    expect(width).toBeCloseTo(53.4, 1); // 16 × 3.33… at one decimal, as the writer rounds it
    expect(cell.html).not.toContain("non-scaling-stroke");
  });

  it("every user width reaches the sheet unchanged (1, 1.4, 2.5 px)", () => {
    for (const strokeWidth of [1, 1.4, 2.5]) {
      const cell = cellGroupOf({ code: ICON, asset, frame, style: { ...DEFAULT_CONFIG.icons, strokeWidth } });
      if (!cell.ok) throw new Error(cell.error);
      expect(penOf(cell.html)).toBeCloseTo(strokeWidth, 3); // what a viewer really paints, in artboard px
    }
  });

  it("the composed sheet's icon group paints the setting, not a box-scaled stranger", () => {
    const config = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "none" as const }, icons: { ...DEFAULT_CONFIG.icons, strokeWidth: 1 } };
    const doc = composeSheet({ config, layout: computeLayout(config), assets: [asset], placedIds: ["a"], svgTexts: { a: ICON } });
    const group = /<g [^>]*data-asset-id="a"[^>]*>/.exec(doc.svg)?.[0] ?? "";
    expect(group).not.toContain("transform=");
    expect(penOf(group)).toBeCloseTo(1, 3);
    expect(doc.svg).not.toContain("non-scaling-stroke");
  });

  it("the EPS program carries the same pen: 2.5 px setting → 2.5 w in PostScript", () => {
    const config = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "none" as const, ringStroke: 1 }, icons: { ...DEFAULT_CONFIG.icons, strokeWidth: 2.5 } };
    const doc = composeSheet({ config, layout: computeLayout(config), assets: [asset], placedIds: ["a"], svgTexts: { a: ICON } });
    setTextOutliner(() => ({ d: "M0 0 L10 0 Z", width: 10 }));
    const outlined = expandTextToFills(solidPaint(doc.svg));
    setTextOutliner(null);
    expect(outlined.ok).toBe(true);
    const eps = writeEps(outlined.ok ? outlined.svg : doc.svg, "#ffffff");
    expect(eps.ok).toBe(true);
    if (!eps.ok) return;
    // The body's pen changes only where the artwork changes it, and the pen it
    // names is the artboard's own px — the same number the SVG states.
    const written = penOf(/<g [^>]*data-asset-id="a"[^>]*>/.exec(doc.svg)?.[0] ?? "");
    const widths = [...eps.eps.slice(eps.eps.indexOf("%%EndSetup")).matchAll(/([\d.]+) w(?=\s)/g)].map((m) => Number(m[1]));
    expect(written).toBeCloseTo(2.5, 3);
    expect(widths).toContain(written);
    // ...and the page's px→pt 0.75 is the only thing between that number and the
    // printed pen: no cell fit is left to multiply it.
    expect(written * 0.75).toBeCloseTo(1.875, 3);
  });

  it("the library tile preview follows the same rule (it shows what the sheet draws)", () => {
    const svg = iconPreviewSvg(ICON, asset, { ...DEFAULT_CONFIG.icons, strokeWidth: 1.5 });
    expect(svg).not.toBeNull();
    expect(svg).not.toContain("non-scaling-stroke");
    expect(svg).not.toContain("transform=");
    // the tile fits a 20 px glyph in a 24 px box and still paints the user's 1.5 px
    expect(penOf(svg ?? "")).toBeCloseTo(1.5, 3);
    expect(/d="M5(\.\d+)? 5/.test(svg ?? "")).toBe(true); // (24 − 20) / 2 = 2 → 5.6 at the 24 scale
  });
});
