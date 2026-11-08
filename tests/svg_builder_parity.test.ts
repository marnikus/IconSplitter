// @vitest-environment happy-dom
// svg_builder_parity.test.ts — the reference "Glyph" sheet constructor's rules
// (docs/archive/2026-11-07-svg-builder-integration/FIXES.md §B–§D) as pure
// domain contracts: ranges clamp, presets, fitted grid, stroke-aware boxes,
// seeded selection with locks, grow/shrink and the export slug.
import { describe, expect, it } from "vitest";
import { validateSvg } from "../src/lib/svgvalidate";
import { DEFAULT_CONFIG, LAYOUT_PRESETS, applyPresetConfig, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { RANGES, bannerRange, clampTo } from "../src/lib/svgBuilder/ranges";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { filterAssets, profilesOf, scoreOf } from "../src/lib/svgBuilder/assets";
import { recipeCaption, refillOne, reshuffleSheet, resizeSheet } from "../src/lib/svgBuilder/selection";
import { emptySlotFor, isEmptySlot, placedOnly } from "../src/lib/svgBuilder/slots";
import { wrapLines } from "../src/lib/svgBuilder/banner";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { parseSheetPreset, sheetSlug } from "../src/lib/svgBuilder/preset";
import type { BuilderIconAsset, SelectionRecipe } from "../src/lib/svgBuilder/types";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

function asset(id: string, category: string): BuilderIconAsset {
  const tags = ["approved", ...category.toLowerCase().split(/\s+/), id];
  return { id, base: id, suffix: "", label: id[0].toUpperCase() + id.slice(1), category, tags,
    svgPath: `${category}/${id}.svg`, svgName: `${id}.svg`, version: 1, fingerprint: `f-${id}`,
    metaPath: `${category}/${id}.svg.json`, approved: true };
}

const food = ["apple", "bread", "cake", "donut", "egg"].map((id) => asset(id, "Food icons"));
const ui = ["home", "gear", "bell", "user", "mail", "lock", "star"].map((id) => asset(id, "Interface"));
const library = [...food, ...ui];
const recipe = (over: Partial<SelectionRecipe> = {}): SelectionRecipe =>
  ({ mode: "random", profileId: "Food icons", threshold: 70, category: "All", textWeight: 50, ...over });

describe("ranges and config parsing", () => {
  it("clamps an out-of-range value instead of reverting to the default", () => {
    expect(clampTo(RANGES.width, 1)).toBe(320);
    expect(clampTo(RANGES.width, 99999)).toBe(3000);
    expect(clampTo(RANGES.strokeWidth, 1.44)).toBe(1.4);
    const c = parseSheetConfig({ ...DEFAULT_CONFIG, artboard: { ...DEFAULT_CONFIG.artboard, width: 5, padding: 999 } });
    expect(c.artboard.width).toBe(320);
    expect(c.artboard.padding).toBe(160);
  });

  it("keeps an empty title (no snap-back to the default text)", () => {
    const c = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, title: "" } });
    expect(c.banner.title).toBe("");
  });

  it("uses the reference defaults", () => {
    expect(DEFAULT_CONFIG.artboard).toMatchObject({ width: 1080, height: 660, padding: 34, radius: 0 });
    expect(DEFAULT_CONFIG.grid).toMatchObject({ columns: 8, rows: 4, gapX: 22, gapY: 18, captionSize: 9 });
    expect(DEFAULT_CONFIG.icons).toMatchObject({ box: 52, strokeWidth: 1.4, linecap: "round" });
    expect(DEFAULT_CONFIG.banner).toMatchObject({ position: "left", size: 242, style: "solid", titleSize: 32 });
  });

  it("has the banner thickness range per position", () => {
    expect(bannerRange("left")).toEqual(RANGES.bannerSide);
    expect(bannerRange("top")).toEqual(RANGES.bannerEdge);
  });
});

describe("layout presets", () => {
  it("offers Side banner, Top split and Plain grid with the reference values", () => {
    expect(LAYOUT_PRESETS.map((p) => p.label)).toEqual(["Side banner", "Top split", "Plain grid"]);
    const top = applyPresetConfig(DEFAULT_CONFIG, "masthead");
    expect(top.grid).toMatchObject({ columns: 10, rows: 5, gapX: 16, gapY: 12, captions: false });
    expect(top.banner).toMatchObject({ position: "top", style: "split", size: 76, hero: false });
    const plain = applyPresetConfig(DEFAULT_CONFIG, "plain");
    expect(plain.artboard).toMatchObject({ width: 1080, height: 560, padding: 46 });
    expect(plain.banner.position).toBe("none");
  });

  it("keeps the user's title, subtitle and hero icon across presets", () => {
    const mine = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, title: "My set", subtitle: "Sub", heroIconId: "egg" } };
    expect(applyPresetConfig(mine, "masthead").banner).toMatchObject({ title: "My set", subtitle: "Sub", heroIconId: "egg" });
  });
});

describe("fitted grid layout", () => {
  it("always has columns × rows cells, centred in the content area", () => {
    const layout = computeLayout({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "none" } });
    expect(layout.cells).toHaveLength(32);
    expect(layout.capacity).toBe(32);
    const g = layout.grid!;
    expect(g.x - layout.content.x).toBeCloseTo(layout.content.x + layout.content.width - (g.x + g.width), 5);
  });

  it("shrinks (never grows) to fit and reports the overflow scale", () => {
    const big = { ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 16, rows: 12 }, icons: { ...DEFAULT_CONFIG.icons, box: 120 } };
    const layout = computeLayout(big);
    expect(layout.overflow).toBe(true);
    expect(layout.fitScale).toBeLessThan(1);
    const last = layout.cells[layout.cells.length - 1];
    expect(last.x + last.size).toBeLessThanOrEqual(layout.content.x + layout.content.width + 0.01);
    expect(computeLayout(DEFAULT_CONFIG).fitScale).toBe(1);
  });

  it("draws the glyph 2.2 × stroke smaller than its box (stroke-aware bounds)", () => {
    const cell = computeLayout(DEFAULT_CONFIG).cells[0];
    expect(cell.size).toBe(52);
    expect(cell.glyph).toBeCloseTo(52 - 1.4 * 2.2, 5);
  });
});

describe("selection recipes", () => {
  const profiles = profilesOf(library);

  it("scores shared tags ÷ profile tags, so a multi-word category matches", () => {
    const profile = profiles.find((p) => p.id === "Food icons")!;
    expect(scoreOf(food[0], profile)).toBe(1);
    expect(scoreOf(ui[0], profile)).toBeLessThan(0.7);
  });

  it("Similar picks only matching icons first, seeded and reproducible", () => {
    const a = reshuffleSheet({ assets: library, profiles, recipe: recipe({ mode: "similar" }), seed: 7, capacity: 4, current: [], lockedIds: [] });
    const b = reshuffleSheet({ assets: library, profiles, recipe: recipe({ mode: "similar" }), seed: 7, capacity: 4, current: [], lockedIds: [] });
    expect(a.ids).toEqual(b.ids);
    expect(a.ids.every((id) => food.some((f) => f.id === id))).toBe(true);
    expect(a.shortfall).toBeNull();
  });

  it("tops up a short pool from the library and reports the shortfall", () => {
    const r = reshuffleSheet({ assets: library, profiles, recipe: recipe({ mode: "similar" }), seed: 1, capacity: 8, current: [], lockedIds: [] });
    expect(r.ids).toHaveLength(8);
    expect(new Set(r.ids).size).toBe(8);
    expect(r.shortfall).toEqual({ pool: 5, cells: 8 });
  });

  it("Filtered uses the category; locked icons keep their cell", () => {
    const current = ["home", "gear", "apple", "bell"];
    const r = reshuffleSheet({ assets: library, profiles, recipe: recipe({ mode: "filtered", category: "Interface" }), seed: 3,
      capacity: 4, current, lockedIds: ["apple"] });
    expect(r.ids[2]).toBe("apple");
    expect(r.ids.filter((id) => id !== "apple").every((id) => ui.some((u) => u.id === id))).toBe(true);
  });

  it("with vector scores, Similar keeps the most similar in rank order and shuffles only the rest", () => {
    const sim: Record<string, number> = { apple: 0.95, bread: 0.9, cake: 0.85, home: 0.5, gear: 0.4, bell: 0.3 };
    const score = (a: BuilderIconAsset) => sim[a.id] ?? 0.1;
    const pick = (seed: number) => reshuffleSheet({ assets: library, profiles, recipe: recipe({ mode: "similar", threshold: 80 }), seed,
      capacity: 6, current: [], lockedIds: [], score });
    const runs = [1, 2, 3, 4, 5, 6].map(pick);
    for (const r of runs) {
      expect(r.ids.slice(0, 3)).toEqual(["apple", "bread", "cake"]); // stable, best first
      expect(r.ids.slice(3).every((id) => (sim[id] ?? 0.1) < 0.8)).toBe(true);
      expect(r.shortfall).toEqual({ pool: 3, cells: 6 });
    }
    expect(new Set(runs.map((r) => r.ids.slice(3).join())).size).toBeGreaterThan(1); // the lower part changes per seed
  });

  it("excluded icons are never drawn, topped up or appended", () => {
    const excludedIds = ["apple", "bread", "cake", "donut"];
    const r = reshuffleSheet({ assets: library, profiles, recipe: recipe({ mode: "filtered", category: "Food icons" }), seed: 2,
      capacity: 12, current: [], lockedIds: [], excludedIds });
    expect(r.ids.some((id) => excludedIds.includes(id))).toBe(false);
    expect(r.ids).toHaveLength(8);
    const grown = resizeSheet({ assets: library, profiles, recipe: recipe(), seed: 5, capacity: 12, current: ["egg"], lockedIds: [], excludedIds });
    expect(grown.some((id) => excludedIds.includes(id))).toBe(false);
  });

  it("refillOne picks one new icon: never placed, never excluded, best similar first", () => {
    const sim: Record<string, number> = { apple: 0.95, bread: 0.9, cake: 0.6 };
    const score = (a: BuilderIconAsset) => sim[a.id] ?? 0;
    const pick = { assets: library, profiles, recipe: recipe({ mode: "similar", threshold: 80 }), seed: 4, capacity: 4,
      current: ["apple", "home", "gear"], lockedIds: [], excludedIds: ["home"], score };
    expect(refillOne(pick)).toBe("bread");
    expect(refillOne({ ...pick, current: library.map((a) => a.id) })).toBeNull();
    const random = refillOne({ ...pick, recipe: recipe({ mode: "random" }) })!;
    expect(["apple", "home", "gear"]).not.toContain(random);
  });

  it("empty-cell placeholders are unique, recognisable and skipped by placedOnly", () => {
    const a = emptySlotFor(["x"]);
    const b = emptySlotFor(["x", a]);
    expect(a).not.toBe(b);
    expect(isEmptySlot(a) && isEmptySlot(b)).toBe(true);
    expect(isEmptySlot("apple")).toBe(false);
    expect(placedOnly(["apple", a, "egg", b])).toEqual(["apple", "egg"]);
  });

  it("growing appends new picks, shrinking truncates", () => {
    const grown = resizeSheet({ assets: library, profiles, recipe: recipe(), seed: 5, capacity: 6, current: ["apple", "home"], lockedIds: [] });
    expect(grown.slice(0, 2)).toEqual(["apple", "home"]);
    expect(grown).toHaveLength(6);
    expect(new Set(grown).size).toBe(6);
    expect(resizeSheet({ assets: library, profiles, recipe: recipe(), seed: 5, capacity: 1, current: ["apple", "home"], lockedIds: [] })).toEqual(["apple"]);
  });

  it("captions the recipe like the reference", () => {
    expect(recipeCaption(recipe({ mode: "similar" }))).toBe("≥ 70% similar · 50% look alike + 50% mean alike");
    expect(recipeCaption(recipe({ mode: "similar", textWeight: 80 }))).toBe("≥ 70% similar · 20% look alike + 80% mean alike");
    expect(recipeCaption(recipe({ mode: "random" }))).toBe("Random from the full library");
    expect(recipeCaption(recipe({ mode: "filtered", category: "All" }))).toBe("Random from every category");
    expect(recipeCaption(recipe({ mode: "filtered", category: "Interface" }))).toBe("Random from interface");
  });

  it("frequent metadata tags become Similar profiles (generic stock tags excluded)", () => {
    const tagged = library.map((a, i) => ({ ...a, keywords: i < 3 ? ["fruit", "icon"] : ["icon"], tags: [...a.tags, ...(i < 3 ? ["fruit"] : []), "icon"] }));
    const ps = profilesOf(tagged);
    const fruit = ps.find((p) => p.id === "#fruit")!;
    expect(fruit.label).toBe("#fruit (3)");
    expect(ps.some((p) => p.id === "#icon")).toBe(false);
    expect(scoreOf(tagged[0], fruit)).toBe(1);
    expect(scoreOf(tagged[5], fruit)).toBeLessThan(0.7);
  });

  it("search strips a leading # and matches tags", () => {
    expect(filterAssets(library, "#interface", "All").map((a) => a.id)).toEqual(ui.map((a) => a.id));
  });
});

describe("banner text and export", () => {
  it("wraps greedily into at most three lines", () => {
    expect(wrapLines("one two three four five six", 8)).toEqual(["one two", "three", "four"]);
    expect(wrapLines("", 8)).toEqual([]);
  });

  it("composes a valid SVG with placeholders excluded and every banner style", () => {
    for (const position of ["left", "top", "right", "bottom"] as const) {
      for (const style of ["solid", "split"] as const) {
        const config = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position, style, heroIconId: "apple" } };
        const doc = composeSheet({ config, layout: computeLayout(config), assets: library, placedIds: ["apple", "home"],
          svgTexts: { apple: SVG, home: SVG } });
        expect(validateSvg(doc.svg).ok, `${position}/${style}`).toBe(true);
        expect(doc.brokenIds).toEqual([]);
        expect(doc.svg).toContain('data-banner-hero="true"');
        expect(doc.svg).not.toContain("data-placeholder");
      }
    }
  });

  it("ignores ids beyond the grid instead of calling them broken", () => {
    const config = { ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 1, rows: 1 } };
    const doc = composeSheet({ config, layout: computeLayout(config), assets: library, placedIds: ["apple", "home"], svgTexts: { apple: SVG, home: SVG } });
    expect(doc.placedIds).toEqual(["apple"]);
    expect(doc.brokenIds).toEqual([]);
  });

  it("slugs the title like the reference and reads the reference preset shape", () => {
    expect(sheetSlug("Food Icons!")).toBe("food-icons");
    expect(sheetSlug("")).toBe("icon-sheet");
    const parsed = parseSheetPreset(JSON.stringify({ version: 1, config: DEFAULT_CONFIG, selection: ["apple", "gone"], seed: 9 }), new Set(["apple"]));
    expect(parsed.preset.placedIds).toEqual(["apple"]);
    expect(parsed.preset.seed).toBe(9);
    expect(parsed.droppedIds).toEqual(["gone"]);
  });
});
