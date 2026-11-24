// @vitest-environment happy-dom
// svg_builder_colored_icons.test.ts — icons of a registered STYLE (2026-11-23,
// `<base id>~colored_wiggle`) keep their own paints on the sheet: a stroke stays a
// stroke (its colour and width), a fill stays a fill (its colour). The sheet's
// colored-icon settings change only what they name: stroke colour and stroke
// width only the strokes, fill colour only the fills. Line-stroke icons stay as
// they always were (stroke-only, the sheet's ink and pen).
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { QUICK_SPECS, quickTargetOf } from "../src/svgBuilder/quickedit";
import type { BuilderIconAsset, SheetConfig } from "../src/lib/svgBuilder/types";

const LINE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
const COLORED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
  + '<path id="blob" d="M4 12c4-6 12-6 16 0z" fill="#F5A623"/>'
  + '<path id="outline" d="M3 3h18v18H3z" fill="none" stroke="#1F2937" stroke-width="2"/>'
  + '<g fill="#123" stroke="none"><path id="inherited" d="M8 8h2v2H8z"/></g>'
  + '<path id="styled" d="M1 1h1v1H1z" style="fill:none;stroke:#abc;stroke-width:3"/>'
  + '<g stroke="rgb(255, 0, 128)" stroke-width="1.5" fill="none"><path id="nested" d="M5 5h1"/></g></svg>';

const asset = (id: string): BuilderIconAsset => ({ id, base: id, suffix: "", label: id, category: "c", tags: [], svgPath: `${id}.svg`, svgName: `${id}.svg`,
  version: 1, fingerprint: "f", metaPath: `${id}.json`, approved: true });
const LINE_ID = "line", COLORED_ID = "cup~colored_wiggle";

function sheet(icons: Partial<SheetConfig["icons"]> = {}, banner: Partial<SheetConfig["banner"]> = { position: "none" }): Document {
  const config = parseSheetConfig({ ...DEFAULT_CONFIG, icons: { ...DEFAULT_CONFIG.icons, ...icons }, banner: { ...DEFAULT_CONFIG.banner, ...banner } });
  const svg = composeSheet({ config, layout: computeLayout(config), assets: [asset(LINE_ID), asset(COLORED_ID)], placedIds: [LINE_ID, COLORED_ID],
    svgTexts: { [LINE_ID]: LINE, [COLORED_ID]: COLORED } }).svg;
  expect(svg).not.toContain("@@"); // no paint marker ever leaves the composer
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}
const cell = (doc: Document, index: string) => doc.querySelector(`[data-cell-index="${index}"]`)!;
const part = (doc: Document, index: string, id: string) => cell(doc, index).querySelector(`[id$="-${id}"]`)!;
const paints = (el: Element) => [el.getAttribute("fill"), el.getAttribute("stroke"), el.getAttribute("stroke-width")];
const scaleOf = (el: Element) => Number(/scale\(([\d.]+)\)/.exec(el.getAttribute("transform") ?? "")?.[1] ?? 1);

describe("colored icons keep their own paints (2026-11-23)", () => {
  it("by default every stroke and fill is the icon's own — resolved from groups and style, colours as hex, strokes in direct artboard px", () => {
    const doc = sheet();
    const c = cell(doc, "1");
    expect([c.getAttribute("fill"), c.getAttribute("stroke")]).toEqual([null, null]); // no stroke-only wrapper
    expect(c.getAttribute("transform")).toBeNull();
    // 2026-11-24: the cell fits the icon's ink, not its 24-unit frame, so it scales at least glyph / 24
    const frameScale = computeLayout(parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "none" } })).cells[1].glyph / 24;
    const cellScale = Number(paints(part(doc, "1", "outline"))[2]) / 2;
    expect(cellScale).toBeGreaterThan(frameScale);
    const own = (id: string, w: number, stroke: string) => {
      const [fill, paint, width] = paints(part(doc, "1", id));
      expect([fill, paint]).toEqual(["none", stroke]);
      expect(Math.abs(Number(width) - w * cellScale)).toBeLessThanOrEqual(0.11); // 1-decimal px, scale read back from a rounded width
    };
    expect(paints(part(doc, "1", "blob"))).toEqual(["#F5A623", "none", null]);
    own("outline", 2, "#1F2937");
    expect(paints(part(doc, "1", "inherited"))).toEqual(["#112233", "none", null]);
    own("styled", 3, "#AABBCC");
    own("nested", 1.5, "#FF0080");
  });

  it("stroke colour and width change only the strokes; fill colour only the fills", () => {
    const doc = sheet({ coloredStroke: "#FF0000", coloredStrokeWidth: 1.5, coloredFill: "#00FF00" });
    const scale = scaleOf(cell(doc, "1"));
    const [, outlineStroke, width] = paints(part(doc, "1", "outline"));
    expect(outlineStroke).toBe("#FF0000");
    expect(Number(width) * scale).toBeCloseTo(1.5, 2); // artboard px, whatever the cell's scale
    expect(paints(part(doc, "1", "blob"))).toEqual(["#00FF00", "none", null]); // a fill: its colour only, never a stroke
    expect(paints(part(doc, "1", "inherited"))).toEqual(["#00FF00", "none", null]);
    expect(paints(part(doc, "1", "outline"))[0]).toBe("none"); // a stroke never gets a fill
    expect(paints(part(doc, "1", "nested"))[1]).toBe("#FF0000");
  });

  it("line-stroke icons are untouched: stroke-only, the sheet's ink and pen", () => {
    const doc = sheet({ coloredStroke: "#FF0000", coloredFill: "#00FF00" });
    const line = cell(doc, "0");
    expect([line.getAttribute("fill"), line.getAttribute("stroke"), line.getAttribute("color")]).toEqual(["none", "currentColor", DEFAULT_CONFIG.icons.color]);
    expect(line.querySelector("path")?.getAttribute("fill")).toBe("none");
  });

  it("a colored banner icon takes the banner's accent on its strokes and the Icon stroke; its fills stay its own", () => {
    const doc = sheet({}, { position: "left", hero: true, heroIconId: COLORED_ID, heroStroke: 2.5, accent: "#2244CC", style: "solid" });
    const hero = cell(doc, "-1");
    expect(part(doc, "-1", "outline").getAttribute("stroke")).toBe("#2244CC");
    expect(Number(part(doc, "-1", "outline").getAttribute("stroke-width")) * scaleOf(hero)).toBeCloseTo(2.5, 2);
    expect(part(doc, "-1", "blob").getAttribute("fill")).toBe("#F5A623");
  });
});

describe("the colored-icon settings (2026-11-23)", () => {
  it("read field by field: empty = each icon's own, else a hex colour / a stroke width in range", () => {
    expect(parseSheetConfig({}).icons).toMatchObject({ coloredStroke: "", coloredStrokeWidth: 0, coloredFill: "" });
    expect(parseSheetConfig({ icons: { coloredStroke: "#ff0000", coloredStrokeWidth: 9, coloredFill: "red" } }).icons)
      .toMatchObject({ coloredStroke: "#FF0000", coloredStrokeWidth: 5, coloredFill: "" });
    expect([0, -1, "abc", 0.2].map((w) => parseSheetConfig({ icons: { coloredStrokeWidth: w } }).icons.coloredStrokeWidth)).toEqual([0, 0, 0, 0.5]);
  });

  it("hovering a colored icon opens the colored-icon toolbar: stroke colour, stroke width, fill colour", () => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("data-cell-index", "3");
    g.setAttribute("data-asset-id", COLORED_ID);
    expect(quickTargetOf([g])?.kind).toBe("styled");
    g.setAttribute("data-asset-id", LINE_ID);
    expect(quickTargetOf([g])?.kind).toBe("icon");
    const spec = QUICK_SPECS.styled;
    expect([spec.color.key, spec.stroke?.key, spec.fill?.key]).toEqual(["coloredStroke", "coloredStrokeWidth", "coloredFill"]);
    expect(QUICK_SPECS.icon.fill).toBeUndefined();
  });
});
