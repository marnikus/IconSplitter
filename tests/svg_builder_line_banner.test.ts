// @vitest-environment happy-dom
// svg_builder_line_banner.test.ts — the "Line" masthead (2026-11-23): the
// banner has no colour of its own (the canvas shows through) and is set off
// from the grid by ONE separator line on its inner edge, its width and colour
// editable. Its words lie out as on a Solid banner. A "Line banner" layout
// preset sits right after Plain grid.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, LAYOUT_PRESETS, applyPresetConfig, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { templateName } from "../src/lib/svgBuilder/templates";
import { paletteWords } from "../src/lib/svgBuilder/sheetfolders";
import { quickTargetOf } from "../src/svgBuilder/quickedit";
import type { SheetConfig } from "../src/lib/svgBuilder/types";

const sheet = (banner: Partial<SheetConfig["banner"]>) => {
  const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, style: "line", hero: false, ...banner } });
  const layout = computeLayout(config);
  return { config, layout, svg: composeSheet({ config, layout, assets: [], placedIds: [], svgTexts: {} }).svg };
};
const lineOf = (svg: string) => {
  const m = /<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" fill="([^"]+)" data-banner-line="true"\/>/.exec(svg);
  return m === null ? null : { x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]), fill: m[5] };
};
const bannerOf = (svg: string) => /<g data-banner="true">[\s\S]*$/.exec(svg)?.[0] ?? "";

describe("the Line masthead (2026-11-23)", () => {
  it("is a valid style with a clamped line width and a colour", () => {
    expect(DEFAULT_CONFIG.banner).toMatchObject({ lineWidth: 1.5, lineColor: expect.stringMatching(/^#[0-9A-F]{6}$/i) });
    const c = parseSheetConfig({ banner: { style: "line", lineWidth: 99, lineColor: "#123456" } }).banner;
    expect(c).toMatchObject({ style: "line", lineWidth: 12, lineColor: "#123456" });
    expect(parseSheetConfig({ banner: { lineWidth: 0.1, lineColor: "red" } }).banner).toMatchObject({ lineWidth: 0.5, lineColor: DEFAULT_CONFIG.banner.lineColor });
  });

  it("draws no banner colour — one separator line on the edge facing the grid, then the words", () => {
    const { svg, layout } = sheet({ position: "bottom", size: 80, lineWidth: 2, lineColor: "#E8C547" });
    const band = bannerOf(svg);
    expect(band).not.toContain(`fill="${DEFAULT_CONFIG.banner.background}"`); // no banner block
    const line = lineOf(svg)!;
    const box = layout.banner!;
    expect(line).toEqual({ x: box.x, y: box.y - 1, width: box.width, height: 2, fill: "#E8C547" }); // centred on the top edge
    expect(band).toContain('data-banner-text="title"');
  });

  it("puts the line on the grid side of every position", () => {
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const top = sheet({ position: "top", size: 80 });
    expect(lineOf(top.svg)!.y).toBe(r1(top.layout.banner!.y + top.layout.banner!.height - 0.75));
    const left = sheet({ position: "left", size: 200 });
    const l = lineOf(left.svg)!;
    expect([l.x, l.width, l.height]).toEqual([r1(left.layout.banner!.x + left.layout.banner!.width - 0.75), 1.5, left.layout.banner!.height]);
    const right = sheet({ position: "right", size: 200 });
    expect(lineOf(right.svg)!.x).toBe(r1(right.layout.banner!.x - 0.75));
  });

  it("a Solid banner draws no separator line", () => {
    expect(lineOf(sheet({ style: "solid", position: "bottom", size: 80 }).svg)).toBeNull();
  });

  it("the Line banner preset follows Plain grid: bottom, Line, dark words on the canvas", () => {
    expect(LAYOUT_PRESETS.map((p) => p.id)).toEqual(["editorial", "masthead", "plain", "line"]);
    const c = applyPresetConfig(DEFAULT_CONFIG, "line");
    expect(c.banner).toMatchObject({ position: "bottom", style: "line" });
    expect(c.banner.textColor).not.toBe(DEFAULT_CONFIG.banner.textColor); // readable on the light canvas
  });

  it("names it Line in template names and folder colours, and the quick editor knows the line", () => {
    const { config, svg } = sheet({ position: "bottom", size: 80 });
    expect(templateName(config, [])).toBe("Bottom banner · 8×4 · Line");
    expect(paletteWords({ ...config, artboard: { ...config.artboard, background: "#FFFFFF" }, banner: { ...config.banner, lineColor: "#E8C547" } })).toEqual(["white", "yellow"]);
    const host = document.createElement("div");
    host.innerHTML = svg;
    const line = host.querySelector("[data-banner-line]")!;
    expect(quickTargetOf([line, line.parentElement!])?.kind).toBe("line");
  });
});
