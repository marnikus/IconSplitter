// builder-fast.spec.ts — one Node micro-lane for the SVG builder's real pure
// modules, provider seams and static panel shell. The full Vitest suite remains
// the TDD contract; this lane is the measured fast pre-commit smoke check.
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FetchLike } from "../src/lib/upload/gemini";
import type { RasterDeps, RasterResult, RasterTarget } from "../src/lib/upload/raster";
import type { BuilderIconAsset } from "../src/lib/svgBuilder/types";
import { FakeDir, FakeFile } from "../tests/helpers/fakefs";
import { pairFile } from "../tests/helpers/pairfile";
import { svgVersion } from "../tests/helpers/svgpair";
import { minimalJpeg } from "../tests/helpers/minijpeg";

installGlobals();

const configMod = await import("../src/lib/svgBuilder/config");
const layoutMod = await import("../src/lib/svgBuilder/layout");
const assetsMod = await import("../src/lib/svgBuilder/assets");
const selectionMod = await import("../src/lib/svgBuilder/selection");
const metadataMod = await import("../src/lib/svgBuilder/metadata");
const presetMod = await import("../src/lib/svgBuilder/preset");
const undoMod = await import("../src/lib/svgBuilder/undo");
const sessionMod = await import("../src/lib/session");
const pairMetaMod = await import("../src/lib/pairmeta");
const uploadDiscoveryMod = await import("../src/upload/discovery");
const builderDiscoveryMod = await import("../src/svgBuilder/discovery");
const geminiMod = await import("../src/lib/upload/gemini");
const previewMod = await import("../src/svgBuilder/preview");
const runMetaMod = await import("../src/svgBuilder/runSheetMetadata");
const exporterMod = await import("../src/svgBuilder/exporter");
const panelMod = await import("../src/svgBuilder/SvgBuilderPanel");

const { DEFAULT_CONFIG, LAYOUT_PRESETS, parseSheetConfig, configFingerprint } = configMod;
const { computeLayout } = layoutMod;
const { categoriesOf, filterAssets, profilesOf, assetsFromRows } = assetsMod;
const { reshuffleSheet, DEFAULT_SELECTION_RECIPE } = selectionMod;
const { DEFAULT_SHEET_PROMPT, parseSheetMetadata, validateSheetMetadata } = metadataMod;
const { parseSheetPreset, serializeSheetPreset } = presetMod;
const { parseBuilderUndoPatch } = undoMod;
const { TAB_IDS, DEFAULT_BUILDER } = sessionMod;
const { serializePairMeta } = pairMetaMod;
const { discoverUploadSources } = uploadDiscoveryMod;
const { discoverBuilderAssets, BUILDER_IGNORE } = builderDiscoveryMod;
const { DEFAULT_GEMINI_CONFIG, AUTH_HEADER, generateContentUrl } = geminiMod;
const { sheetPreviewFor } = previewMod;
const { generateSheetMetadata } = runMetaMod;
const { verifySheetDocument } = exporterMod;
const SvgBuilderPanel = panelMod.default;

interface Case { name: string; fn: () => void | Promise<void> }
const cases: Case[] = [];
const test = (name: string, fn: Case["fn"]): void => { cases.push({ name, fn }); };

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
const SHEET = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="660" viewBox="0 0 1080 660"><rect width="1080" height="660" fill="#fff"/></svg>';
const ANSWER = JSON.stringify({ title: "Quiet line icons", subtitle: "Approved vector set", keywords: ["icon", "vector", "line"] });

const assets: BuilderIconAsset[] = [
  { id: "a", base: "star", suffix: "", label: "Star", category: "UI", tags: ["ui", "star", "favorite"],
    svgPath: "ui/star_AI.svg", svgName: "star_AI.svg", version: 1, fingerprint: "10:1", metaPath: "ui/star_AI.svg.json", approved: true },
  { id: "b", base: "cloud", suffix: "", label: "Cloud", category: "Nature", tags: ["nature", "cloud", "weather"],
    svgPath: "nature/cloud_AI.svg", svgName: "cloud_AI.svg", version: 2, fingerprint: "11:2", metaPath: "nature/cloud_AI.svg.json", approved: true },
  { id: "c", base: "leaf", suffix: "", label: "Leaf", category: "Nature", tags: ["nature", "leaf", "green"],
    svgPath: "nature/leaf_AI.svg", svgName: "leaf_AI.svg", version: 1, fingerprint: "12:3", metaPath: "nature/leaf_AI.svg.json", approved: true },
];

function recipe(over: Record<string, unknown> = {}): typeof DEFAULT_SELECTION_RECIPE {
  return { ...DEFAULT_SELECTION_RECIPE, mode: "random", ...over } as typeof DEFAULT_SELECTION_RECIPE;
}

test("config defaults, presets and validated parsing", () => {
  assert.ok(DEFAULT_CONFIG.artboard.width > 600);
  assert.equal(LAYOUT_PRESETS.length, 3);
  assert.equal(parseSheetConfig({ ...DEFAULT_CONFIG, artboard: { ...DEFAULT_CONFIG.artboard, width: -9 } }).artboard.width, 320);
  const parsed = parseSheetConfig({ ...DEFAULT_CONFIG, artboard: { ...DEFAULT_CONFIG.artboard, width: "x" }, junk: true });
  assert.equal(parsed.artboard.width, DEFAULT_CONFIG.artboard.width);
  assert.equal(configFingerprint(parsed), configFingerprint(parseSheetConfig(DEFAULT_CONFIG)));
});

test("geometry reports capacity, cells and overflow", () => {
  const config = { ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 3, rows: 2 },
    banner: { ...DEFAULT_CONFIG.banner, position: "none" as const } };
  const layout = computeLayout(config);
  assert.equal(layout.capacity, 6);
  assert.equal(layout.cells.length, 6);
  assert.equal(layout.banner, null);
  const big = { ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 16, rows: 12 }, icons: { ...DEFAULT_CONFIG.icons, box: 120 } };
  assert.equal(computeLayout(big).overflow, true);
});

test("catalog filters are case-insensitive and derive categories", () => {
  assert.deepEqual(categoriesOf(assets), ["All", "Nature", "UI"]);
  assert.ok(profilesOf(assets).some((p) => p.id === "Nature"));
  assert.deepEqual(filterAssets(assets, "STAR", "all").map((a) => a.id), ["a"]);
  assert.deepEqual(filterAssets(assets, "", "Nature").map((a) => a.id), ["b", "c"]);
});

test("selection is seeded, locked and honest about the top-up", () => {
  const pick = (over: Record<string, unknown>, current: string[] = [], lockedIds: string[] = []) =>
    reshuffleSheet({ assets, profiles: profilesOf(assets), recipe: recipe(over), seed: 2841, capacity: 3, current, lockedIds });
  const one = pick({}, ["c", "a", "b"], ["c"]);
  assert.deepEqual(one.ids, pick({}, ["c", "a", "b"], ["c"]).ids);
  assert.equal(one.ids[0], "c");
  const short = pick({ mode: "filtered", category: "UI" });
  assert.equal(short.ids[0], "a");
  assert.deepEqual(short.shortfall, { pool: 1, cells: 3 });
});

test("metadata prompt, fenced answer and validation", () => {
  assert.match(DEFAULT_SHEET_PROMPT, /title/);
  assert.match(DEFAULT_SHEET_PROMPT, /keywords/);
  const parsed = parseSheetMetadata('```json\n{"title":" Quiet line icons ","subtitle":"Approved vector set","keywords":["icon","icon","vector"]}\n```');
  assert.equal(parsed.title, "Quiet line icons");
  assert.deepEqual(parsed.keywords, ["icon", "vector"]);
  assert.equal(validateSheetMetadata(parsed).ok, true);
});

test("builder preset round-trips and prunes stale approved ids", () => {
  const raw = JSON.stringify(serializeSheetPreset({
    v: 1, config: DEFAULT_CONFIG, placedIds: ["a", "gone"], lockedIds: ["a"], seed: 2841,
    recipe: recipe(), metadata: null, sources: assets.map((a) => ({ id: a.id, fingerprint: a.fingerprint })),
  }));
  const parsed = parseSheetPreset(raw, new Set(["a"]));
  assert.deepEqual(parsed.preset.placedIds, ["a"]);
  assert.deepEqual(parsed.droppedIds, ["gone"]);
});

test("builder undo payload refuses junk", () => {
  const patch = parseBuilderUndoPatch({ config: DEFAULT_CONFIG, recipe: recipe(), lockedIds: ["a"], seed: 3 });
  assert.ok(patch);
  assert.equal(parseBuilderUndoPatch({ config: null, recipe: {}, lockedIds: [], seed: 3 }), null);
});

test("session knows the seventh tab and its default slice", () => {
  assert.ok(TAB_IDS.includes("svgBuilder"));
  assert.equal(TAB_IDS.length, 7);
  assert.deepEqual(DEFAULT_BUILDER.checked, []);
});

test("all-folder approved discovery keeps upload scope and ignores output", async () => {
  const root = fakeRoot();
  const upload = await discoverUploadSources(root);
  assert.equal(upload.rows.length, 1);
  const all = await discoverUploadSources(root, { hideOutside: false, ignoreDirs: BUILDER_IGNORE });
  assert.equal(all.rows.length, 2);
  const found = await discoverBuilderAssets(root);
  assert.equal(found.assets.length, 2);
  assert.ok(found.assets.every((a) => a.approved));
  assert.equal(assetsFromRows(found.rows).length, 2);
  const empty = await discoverBuilderAssets(new FakeDir("empty"));
  assert.deepEqual(empty.assets, []);
  assert.equal(empty.audit.rows, 0);
});

test("bounded sheet preview uses the injected rasterizer, no DOM", async () => {
  const seen: { target: RasterTarget | null } = { target: null };
  const rasterize = async (_svg: string, box: RasterTarget, _deps?: RasterDeps): Promise<RasterResult> => {
    seen.target = box;
    const jpeg = minimalJpeg(box.width, box.height);
    const record = { width: box.width, height: box.height, quality: box.quality,
      bytes: jpeg.length, hash: "test", profile: "baseline" };
    void _svg; void _deps;
    return { ok: true, jpeg, record } as unknown as RasterResult;
  };
  const out = await sheetPreviewFor(SHEET, { rasterize });
  assert.equal(seen.target?.width, 768);
  assert.equal(seen.target?.height, 469);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.width, 768);
  assert.equal(out.mime, "image/jpeg");
});

test("Gemini metadata sends exactly one previewed request", async () => {
  let calls = 0;
  let seenUrl = "";
  let seenBody = "";
  const fetch: FetchLike = async (url, init) => {
    calls += 1; seenUrl = url; seenBody = String(init.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: ANSWER }] }, finishReason: "STOP" }] }), { status: 200 });
  };
  const out = await generateSheetMetadata({ config: DEFAULT_GEMINI_CONFIG, apiKey: "test-key",
    prompt: DEFAULT_SHEET_PROMPT, preview: "data:image/jpeg;base64,QUJD", fetch });
  assert.equal(calls, 1);
  assert.equal(seenUrl, generateContentUrl(DEFAULT_GEMINI_CONFIG.baseUrl, DEFAULT_GEMINI_CONFIG.model));
  assert.equal((JSON.parse(seenBody).contents[0].parts[1].inlineData.data), "QUJD");
  assert.equal(AUTH_HEADER, "x-goog-api-key");
  assert.equal(out.ok, true);
});

test("Gemini metadata refuses a missing key or preview without sending", async () => {
  let calls = 0;
  const fetch: FetchLike = async () => { calls += 1; return new Response("{}", { status: 200 }); };
  const noKey = await generateSheetMetadata({ config: DEFAULT_GEMINI_CONFIG, apiKey: "",
    prompt: DEFAULT_SHEET_PROMPT, preview: "data:image/jpeg;base64,QUJD", fetch });
  const noPreview = await generateSheetMetadata({ config: DEFAULT_GEMINI_CONFIG, apiKey: "test-key",
    prompt: DEFAULT_SHEET_PROMPT, preview: "", fetch });
  assert.equal(calls, 0);
  assert.equal(noKey.ok, false);
  assert.equal(noPreview.ok, false);
});

test("export verification refuses broken or unapproved documents", () => {
  const doc = { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>", placedIds: ["a"], brokenIds: [],
    sourceFingerprints: [], configFingerprint: "x", metadata: null };
  assert.equal(verifySheetDocument(doc, assets).ok, true);
  assert.equal(verifySheetDocument({ ...doc, placedIds: ["ghost"] }, assets).ok, false);
  assert.equal(verifySheetDocument({ ...doc, brokenIds: ["a"] }, assets).ok, false);
});

test("dark panel shell renders the folder, header, library, stage and customize handles", () => {
  const markup = renderToStaticMarkup(React.createElement(SvgBuilderPanel, { active: true }));
  for (const id of ["builder-panel", "builder-unsupported", "builder-open-folder", "builder-folder-widget",
    "builder-header", "builder-library", "builder-recipe", "builder-stage", "builder-inspector",
    "builder-section-grid", "builder-export"]) assert.match(markup, new RegExp(`data-testid="${id}"`));
});

export async function runFastBuilderTests(): Promise<{ passed: number; failed: number; failures: string[] }> {
  let passed = 0;
  const failures: string[] = [];
  for (const c of cases) {
    try { await c.fn(); passed += 1; }
    catch (error) { failures.push(`${c.name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return { passed, failed: failures.length, failures };
}

function installGlobals(): void {
  const store = new Map<string, string>();
  Reflect.set(globalThis, "localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  });
  Reflect.set(globalThis, "window", globalThis);
  Reflect.set(globalThis, "fetch", async () => new Response("{}", { status: 200 }));
}

function sidecar(dir: string, aiName: string): string {
  const stem = aiName.replace(/\.png$/i, "");
  return serializePairMeta(pairFile(dir, aiName, {
    versions: [svgVersion(`${dir}/${stem}.svg`, { version: 1, review: "approved" })],
  }));
}

function pairDir(root: FakeDir, dir: string, aiName: string, metaText: string): void {
  let node = root;
  for (const part of dir.split("/")) {
    const child = node.children.get(part);
    if (child instanceof FakeDir) node = child;
    else { const made = new FakeDir(part); node.children.set(part, made); node = made; }
  }
  const stem = aiName.replace(/\.png$/i, "");
  node.children.set(aiName, new FakeFile(aiName, 20, 3100, "ai"));
  node.children.set(`${stem}.svg`, new FakeFile(`${stem}.svg`, SVG.length, 3400, SVG));
  node.children.set(`${stem}.svg.json`, new FakeFile(`${stem}.svg.json`, metaText.length, 3500, metaText));
}

function fakeRoot(): FakeDir {
  const root = new FakeDir("my_icons");
  const inside = "_split_output/2026-11/2026-11-07_10-00-00/fog_AI/split_01";
  pairDir(root, inside, "fog_AI.png", sidecar(inside, "fog_AI.png"));
  pairDir(root, "icons/ui", "star_AI.png", sidecar("icons/ui", "star_AI.png"));
  pairDir(root, "export", "old_AI.png", sidecar("export", "old_AI.png"));
  pairDir(root, "svg-builder", "sheet_AI.png", sidecar("svg-builder", "sheet_AI.png"));
  return root;
}
