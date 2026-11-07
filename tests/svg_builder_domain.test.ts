// @vitest-environment happy-dom
// svg_builder_domain.test.ts — TDD contract for the builder's pure domain.
// All geometry, selection, metadata, SVG safety and export composition rules
// live in src/lib/svgBuilder, so they are testable without the Workbench.
import { describe, expect, it } from "vitest";
import { validateSvg } from "../src/lib/svgvalidate";
import {
  DEFAULT_CONFIG, LAYOUT_PRESETS, parseSheetConfig, configFingerprint,
} from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { categoriesOf, filterAssets, profilesOf } from "../src/lib/svgBuilder/assets";
import { reshuffleSheet } from "../src/lib/svgBuilder/selection";
import {
  DEFAULT_SHEET_PROMPT, cleanSheetMetadata, parseSheetMetadata, validateSheetMetadata,
} from "../src/lib/svgBuilder/metadata";
import { cellGroupOf } from "../src/lib/svgBuilder/svgAsset";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { parseSheetPreset, serializeSheetPreset } from "../src/lib/svgBuilder/preset";
import type {
  BuilderIconAsset, SelectionRecipe, SheetConfig, SheetMetadata,
} from "../src/lib/svgBuilder/types";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="red" stroke="blue"/></svg>';
const UNSAFE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path d="M2 2h20"/></svg>';

const assets: BuilderIconAsset[] = [
  { id: "a", base: "star", suffix: "", label: "Star", category: "UI", tags: ["ui", "star", "favorite"],
    svgPath: "ui/star_AI.svg", svgName: "star_AI.svg", version: 1, fingerprint: "10:1", metaPath: "ui/star_AI.svg.json", approved: true },
  { id: "b", base: "cloud", suffix: "", label: "Cloud", category: "Nature", tags: ["nature", "cloud", "weather"],
    svgPath: "nature/cloud_AI.svg", svgName: "cloud_AI.svg", version: 2, fingerprint: "11:2", metaPath: "nature/cloud_AI.svg.json", approved: true },
  { id: "c", base: "leaf", suffix: "", label: "Leaf", category: "Nature", tags: ["nature", "leaf", "green"],
    svgPath: "nature/leaf_AI.svg", svgName: "leaf_AI.svg", version: 1, fingerprint: "12:3", metaPath: "nature/leaf_AI.svg.json", approved: true },
];

function recipe(over: Partial<SelectionRecipe> = {}): SelectionRecipe {
  return { mode: "random", profileId: "all", threshold: 70, category: "All", ...over };
}

const FRAME = { index: 0, x: 10, y: 20, size: 48, glyph: 44, captionY: 76, captionSize: 9 };

function acceptedMetadata(): SheetMetadata {
  return { title: "Quiet line icons", subtitle: "Approved vector set", keywords: ["icon", "vector", "line"],
    state: "accepted", validation: { ok: true, errors: [], warnings: [] }, fingerprint: "meta-1" };
}

describe("sheet config and layout", () => {
  it("has dark-app-friendly defaults and three presets", () => {
    expect(DEFAULT_CONFIG.artboard.width).toBeGreaterThan(600);
    expect(DEFAULT_CONFIG.icons.color).not.toBe("#000000");
    expect(LAYOUT_PRESETS).toHaveLength(3);
    expect(new Set(LAYOUT_PRESETS.map((p) => p.id)).size).toBe(3);
  });

  it("validates a stored config, dropping foreign fields", () => {
    const parsed = parseSheetConfig({ ...DEFAULT_CONFIG, artboard: { ...DEFAULT_CONFIG.artboard, width: "x" }, junk: true });
    expect(parsed.artboard.width).toBe(DEFAULT_CONFIG.artboard.width);
    expect(parsed).not.toHaveProperty("junk");
    expect(configFingerprint(parsed)).toBe(configFingerprint(parseSheetConfig(DEFAULT_CONFIG)));
  });

  it("computes capacity, cells and a none-banner content box", () => {
    const config: SheetConfig = { ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 3, rows: 2 },
      banner: { ...DEFAULT_CONFIG.banner, position: "none" } };
    const layout = computeLayout(config);
    expect(layout.capacity).toBe(6);
    expect(layout.cells).toHaveLength(6);
    expect(layout.overflow).toBe(false);
    expect(layout.banner).toBeNull();
    expect(layout.content.x).toBe(config.artboard.padding);
    expect(layout.cells[1].x).toBeGreaterThan(layout.cells[0].x);
  });

  it("creates exactly capacity cells, whatever is placed", () => {
    const layout = computeLayout(DEFAULT_CONFIG);
    expect(layout.cells).toHaveLength(layout.capacity);
  });
});

describe("asset library rules", () => {
  it("derives dynamic categories and profiles from approved assets", () => {
    expect(categoriesOf(assets)).toEqual(["All", "Nature", "UI"]);
    expect(profilesOf(assets).map((p) => p.id)).toContain("Nature");
  });

  it("filters by case-insensitive text and category", () => {
    expect(filterAssets(assets, "STAR", "all").map((a) => a.id)).toEqual(["a"]);
    expect(filterAssets(assets, "", "Nature").map((a) => a.id)).toEqual(["b", "c"]);
    expect(filterAssets(assets, "missing", "all")).toEqual([]);
  });
});

describe("deterministic asset selection", () => {
  const pick = (over: Partial<SelectionRecipe>, current: string[] = [], lockedIds: string[] = []) =>
    reshuffleSheet({ assets, profiles: profilesOf(assets), recipe: recipe(over), seed: 2841, capacity: 3, current, lockedIds });

  it("keeps locked ids in their cell, never duplicates, and is stable for one seed", () => {
    const first = pick({}, ["c", "a", "b"], ["c"]);
    expect(first.ids).toEqual(pick({}, ["c", "a", "b"], ["c"]).ids);
    expect(first.ids[0]).toBe("c");
    expect(new Set(first.ids).size).toBe(first.ids.length);
  });

  it("reports a short category instead of hiding the top-up", () => {
    const out = pick({ mode: "filtered", category: "UI" });
    expect(out.ids[0]).toBe("a");
    expect(out.ids).toHaveLength(3);
    expect(out.shortfall).toEqual({ pool: 1, cells: 3 });
  });
});

describe("sheet metadata", () => {
  it("parses a fenced JSON answer, cleans it and validates it", () => {
    const answer = '```json\n{"title":" Quiet line icons ","subtitle":"Approved vector set","keywords":["icon","icon","vector"]}\n```';
    const parsed = parseSheetMetadata(answer);
    expect(parsed.title).toBe("Quiet line icons");
    expect(parsed.keywords).toEqual(["icon", "vector"]);
    expect(validateSheetMetadata(parsed).ok).toBe(true);
  });

  it("refuses prose, an empty title and forbidden-looking keywords", () => {
    expect(() => parseSheetMetadata("I cannot answer")).toThrow();
    const invalid = validateSheetMetadata(cleanSheetMetadata({ title: "", subtitle: "", keywords: ["https://example.com"] }));
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/title|keyword/i);
  });

  it("has a default prompt that names the exact output contract", () => {
    expect(DEFAULT_SHEET_PROMPT).toContain("title");
    expect(DEFAULT_SHEET_PROMPT).toContain("keywords");
    expect(DEFAULT_SHEET_PROMPT).toContain("JSON");
  });
});

describe("approved SVG embedding and composition", () => {
  it("sanitises one approved SVG into a cell group without scripts or remote code", () => {
    const frame = FRAME;
    const safe = cellGroupOf({ code: SVG, asset: assets[0], frame, style: DEFAULT_CONFIG.icons });
    expect(safe.ok).toBe(true);
    if (!safe.ok) return;
    expect(safe.html).toContain('data-asset-id="a"');
    expect(safe.html).toContain('data-approved="true"');
    expect(safe.html).toContain("currentColor");
    expect(safe.html).not.toContain("<script");
    expect(safe.html).not.toContain("fill=\"red\"");
    const unsafe = cellGroupOf({ code: UNSAFE, asset: assets[0], frame, style: DEFAULT_CONFIG.icons });
    expect(unsafe.ok).toBe(false);
  });

  it("composes one valid standalone SVG with traceability and accepted metadata", () => {
    const config = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "none" as const } };
    const layout = computeLayout(config);
    const doc = composeSheet({
      config, layout, assets, placedIds: ["a", "b"],
      svgTexts: { a: SVG, b: SVG }, metadata: acceptedMetadata(),
    });
    expect(doc.placedIds).toEqual(["a", "b"]);
    expect(doc.brokenIds).toEqual([]);
    expect(doc.svg).toContain("<title>Quiet line icons — icon sheet</title>");
    expect(doc.svg).toContain('data-asset-id="a"');
    expect(doc.svg).toContain('data-config-fingerprint="' + doc.configFingerprint + '"');
    expect(doc.svg).toContain("\"id\":\"a\"");
    expect(validateSvg(doc.svg).ok).toBe(true);
  });

  it("reports a broken approved asset instead of pretending it rendered", () => {
    const layout = computeLayout(DEFAULT_CONFIG);
    const doc = composeSheet({ config: DEFAULT_CONFIG, layout, assets, placedIds: ["a"], svgTexts: { a: UNSAFE } });
    expect(doc.brokenIds).toEqual(["a"]);
    expect(doc.svg).toContain("data-broken-asset=\"a\"");
  });
});

describe("builder presets", () => {
  it("round-trips a validated preset and prunes ids that are no longer approved", () => {
    const raw = JSON.stringify(serializeSheetPreset({
      v: 1, config: DEFAULT_CONFIG, placedIds: ["a", "gone"], lockedIds: ["a"], seed: 2841,
      recipe: recipe(), metadata: acceptedMetadata(), sources: assets.map((a) => ({ id: a.id, fingerprint: a.fingerprint })),
    }));
    const parsed = parseSheetPreset(raw, new Set(["a"]));
    expect(parsed.preset.placedIds).toEqual(["a"]);
    expect(parsed.droppedIds).toEqual(["gone"]);
    expect(parsed.preset.config.artboard.width).toBe(DEFAULT_CONFIG.artboard.width);
  });
});
