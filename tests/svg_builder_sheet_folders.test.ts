// @vitest-environment happy-dom
// svg_builder_sheet_folders.test.ts — where artboard sheets are saved (2026-11-14):
// _artboard_sheets/<YYYY-MM>/<YYYY-MM-DD>/<title>_sheet_<n>_icons_<colours>_palette_id<code>/artboard_variant_<N>/export
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { newArtboard, parseArtboards } from "../src/lib/svgBuilder/artboards";
import {
  artboardFolder, colorWord, dayPath, paletteWords, sheetFolderName, sheetStem, templateCode, variantOf,
} from "../src/lib/svgBuilder/sheetfolders";

const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, background: "#2E8B57", accent: "#F2E14C" } });
const tpl = newTemplate(config, [], "t", "tpl-1");
const NOW = new Date(2026, 10, 9, 15, 30);

describe("artboard sheet folders", () => {
  it("dates like the batch tree: <YYYY-MM>/<YYYY-MM-DD>", () => {
    expect(dayPath(NOW)).toBe("2026-11/2026-11-09");
  });

  it("names colours in plain words and takes the banner's two colours", () => {
    expect([colorWord("#2E8B57"), colorWord("#F2E14C"), colorWord("#000000"), colorWord("#FFFFFF"), colorWord("#808080"), colorWord("#1E5BD8")])
      .toEqual(["green", "yellow", "black", "white", "gray", "blue"]);
    expect(paletteWords(config)).toEqual(["green", "yellow"]);
  });

  it("names the sheet folder from the Title-Artboard, the icon count, the palette and the template code", () => {
    const name = sheetFolderName({ title: "Household and food icons", icons: 16, palette: ["green", "yellow"], templateId: "tpl-1" });
    expect(name).toBe(`household-and-food-icons_sheet_16_icons_green_yellow_palette_id${templateCode("tpl-1")}`);
    expect(templateCode("tpl-1")).toMatch(/^\d{5}$/);
  });

  it("an artboard's variant is its #N; artboards of one template share the sheet folder; a saved folder is kept", () => {
    const a1 = { ...newArtboard(tpl, [], { now: "t", id: "a1" }), title: "Household and food icons" };
    const a2 = newArtboard(tpl, [a1], { now: "t", id: "a2" });
    expect([variantOf(a1, [a1, a2]), variantOf(a2, [a1, a2])]).toEqual([1, 2]);
    const f1 = artboardFolder({ artboard: a1, artboards: [a1, a2], config, icons: 16, now: NOW });
    expect(f1).toBe(`_artboard_sheets/2026-11/2026-11-09/household-and-food-icons_sheet_16_icons_green_yellow_palette_id${templateCode("tpl-1")}/artboard_variant_1`);
    const saved1 = { ...a1, folder: f1 };
    const f2 = artboardFolder({ artboard: a2, artboards: [saved1, a2], config, icons: 9, now: new Date(2026, 11, 1) });
    expect(f2).toBe(f1.replace("artboard_variant_1", "artboard_variant_2")); // the template's sheet folder, its own variant
    expect(artboardFolder({ artboard: saved1, artboards: [saved1], config, icons: 3, now: new Date(2027, 0, 1) })).toBe(f1);
    expect(sheetStem(f1)).toBe(`household-and-food-icons_sheet_16_icons_green_yellow_palette_id${templateCode("tpl-1")}_v1`);
  });

  it("the folder is saved with the artboard; older saves read null", () => {
    const a = { ...newArtboard(tpl, [], { now: "t", id: "a" }), folder: "_artboard_sheets/x/y/z/artboard_variant_1" };
    expect(parseArtboards([a])[0].folder).toBe(a.folder);
    expect(parseArtboards([{ ...a, folder: undefined }])[0].folder).toBeNull();
    expect(parseArtboards([{ ...a, folder: "../escape" }])[0].folder).toBeNull(); // only inside _artboard_sheets
  });
});
