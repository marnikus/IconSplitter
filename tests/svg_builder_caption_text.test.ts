// @vitest-environment happy-dom
// svg_builder_caption_text.test.ts — captions (2026-11-14): size up to 100 px, a
// gap between icon and caption, and caption words typed by hand that belong to
// the sheet / artboard like its title (never to a template's look).
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, applyCopy, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { RANGES } from "../src/lib/svgBuilder/ranges";
import { computeLayout, captionRow } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { lookOf, newTemplate } from "../src/lib/svgBuilder/templates";
import { overridesOf } from "../src/lib/svgBuilder/lookoverrides";
import { artboardConfig, newArtboard, parseArtboards } from "../src/lib/svgBuilder/artboards";

const asset = { id: "a", base: "x", suffix: "", label: "Toast", category: "c", tags: [], svgPath: "x.svg", svgName: "x.svg", version: 1, fingerprint: "f", metaPath: "x.json", approved: true as const };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
const base = parseSheetConfig({ ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, captions: true } });

describe("captions", () => {
  it("size goes up to 100 px; the gap is 0–120 px, 0 on older configs", () => {
    expect(RANGES.captionSize.max).toBe(100);
    expect(parseSheetConfig({ grid: { captionSize: 80 } }).grid.captionSize).toBe(80);
    expect(parseSheetConfig({ grid: {} }).grid.captionGap).toBe(0);
    expect(parseSheetConfig({ grid: { captionGap: 999 } }).grid.captionGap).toBe(RANGES.captionGap.max);
  });

  it("the gap moves every caption down and makes the caption row taller", () => {
    const gapped = { ...base, grid: { ...base.grid, captionGap: 20 } };
    expect(captionRow(gapped)).toBe(captionRow(base) + 20);
    const a = computeLayout(base), b = computeLayout(gapped);
    const shift = b.cells[0].captionY - b.cells[0].y - (a.cells[0].captionY - a.cells[0].y);
    expect(shift).toBeCloseTo(20 * b.fitScale, 3);
  });

  it("a caption typed by hand replaces the icon's name; an empty one is ignored", () => {
    const typed = { ...base, banner: { ...base.banner, captionTexts: { a: "My Toast" } } };
    const svg = composeSheet({ config: typed, layout: computeLayout(typed), assets: [asset], placedIds: ["a"], svgTexts: { a: SVG } }).svg;
    expect(svg).toContain(">My Toast<");
    expect(svg).toContain('data-caption-id="a"');
    expect(parseSheetConfig({ banner: { captionTexts: { a: "x", b: "", c: 5 } } }).banner.captionTexts).toEqual({ a: "x" });
  });

  it("typed captions belong only to the template or artboard they were typed on — never to the icon's metadata", () => {
    const typed = { ...base, banner: { ...base.banner, captionTexts: { a: "Mine" } } };
    expect(lookOf(typed).banner.captionTexts).toEqual({ a: "Mine" }); // a template keeps its own, like its sample title
    expect(applyCopy(lookOf(base), typed).banner.captionTexts).toEqual({ a: "Mine" });
    const tpl = newTemplate(typed, [], "t", "tpl");
    expect(overridesOf(tpl, base)).toEqual({}); // not a look change
    const fresh = newArtboard(tpl, [], { now: "t", id: "fresh" });
    expect(fresh.captionTexts).toEqual({}); // an artboard never takes the template's typed captions
    expect(artboardConfig(tpl, fresh).banner.captionTexts).toEqual({});
    const art = { ...fresh, id: "art", captionTexts: { a: "Own" } };
    expect(artboardConfig(tpl, art).banner.captionTexts).toEqual({ a: "Own" });
    expect(asset.label).toBe("Toast"); // the icon itself is untouched
    expect(parseArtboards([art])[0].captionTexts).toEqual({ a: "Own" });
    expect(parseArtboards([{ ...art, captionTexts: undefined }])[0].captionTexts).toEqual({});
  });
});
