// @vitest-environment happy-dom
// svg_builder_sheet_folders.test.ts — where templates and their artboards are saved
// (2026-11-16): one folder per TEMPLATE, made when the template is created
//   _artboard_sheets/<YYYY-MM>/<YYYY-MM-DD>/<title>_sheet_<cells>_icons_<colours>_palette_id<code>/
// holding template.json (its blueprint) and one folder per derived ARTBOARD
//   artboard_<NN>_<its title>/   (metadata.json, preview.png, export/)
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { newTemplate, parseTemplates } from "../src/lib/svgBuilder/templates";
import { newArtboard, parseArtboards } from "../src/lib/svgBuilder/artboards";
import {
  artboardFolder, colorWord, dayPath, paletteWords, sheetStem, templateCode, templateFolder, variantOf,
} from "../src/lib/svgBuilder/sheetfolders";

const config = parseSheetConfig({ ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 10, rows: 5 }, banner: { ...DEFAULT_CONFIG.banner, title: "Food and beverage icons", background: "#2E8B57", accent: "#F2E14C" } });
const tpl = newTemplate(config, [], "t", "tpl-1");
const NOW = new Date(2026, 10, 9, 15, 30);
const TPL_DIR = `_artboard_sheets/2026-11/2026-11-09/food-and-beverage-icons_sheet_50_icons_green_yellow_palette_id${templateCode("tpl-1")}`;

describe("template and artboard folders", () => {
  it("dates like the batch tree; colours in plain words", () => {
    expect(dayPath(NOW)).toBe("2026-11/2026-11-09");
    expect([colorWord("#2E8B57"), colorWord("#F2E14C"), colorWord("#000000"), colorWord("#FFFFFF"), colorWord("#808080"), colorWord("#1E5BD8")])
      .toEqual(["green", "yellow", "black", "white", "gray", "blue"]);
    expect(paletteWords(config)).toEqual(["green", "yellow"]);
  });

  it("a template's folder comes from ITS title, cells, colours and code — and is kept once made", () => {
    expect(templateFolder(tpl, NOW)).toBe(TPL_DIR);
    expect(templateFolder({ ...tpl, folder: "_artboard_sheets/x/y/kept" }, NOW)).toBe("_artboard_sheets/x/y/kept");
    expect(parseTemplates([{ ...tpl, folder: TPL_DIR }])[0].folder).toBe(TPL_DIR);
    expect(parseTemplates([{ ...tpl, folder: "../escape" }])[0].folder).toBeNull();
    expect(parseTemplates([{ ...tpl, folder: undefined }])[0].folder).toBeNull();
  });

  it("each artboard is a numbered folder with its own title INSIDE its template's folder", () => {
    const saved = { ...tpl, folder: TPL_DIR };
    const a1 = { ...newArtboard(saved, [], { now: "t", id: "a1" }), title: "Food and kitchen icons" };
    const a2 = newArtboard(saved, [a1], { now: "t", id: "a2" });
    expect([variantOf(a1, [a1, a2]), variantOf(a2, [a1, a2])]).toEqual([1, 2]);
    const f1 = artboardFolder({ artboard: a1, artboards: [a1, a2], template: saved, now: NOW });
    expect(f1).toBe(`${TPL_DIR}/artboard_01_food-and-kitchen-icons`);
    expect(artboardFolder({ artboard: a2, artboards: [a1, a2], template: saved, now: new Date(2027, 0, 1) }))
      .toBe(`${TPL_DIR}/artboard_02_${a2.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`);
    expect(artboardFolder({ artboard: { ...a1, folder: f1, title: "Renamed later" }, artboards: [a1], template: saved, now: NOW })).toBe(f1); // kept
    expect(sheetStem(f1)).toBe(`food-and-beverage-icons_sheet_50_icons_green_yellow_palette_id${templateCode("tpl-1")}_v1`);
  });

  it("an artboard of a template saved before folders existed still gets the template's folder", () => {
    const a = newArtboard(tpl, [], { now: "t", id: "a" });
    expect(artboardFolder({ artboard: a, artboards: [a], template: tpl, now: NOW }).startsWith(`${TPL_DIR}/artboard_01_`)).toBe(true);
    expect(parseArtboards([{ ...a, folder: "../x" }])[0].folder).toBeNull();
  });
});
