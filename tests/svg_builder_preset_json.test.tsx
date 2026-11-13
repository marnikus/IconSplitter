// @vitest-environment happy-dom
// svg_builder_preset_json.test.tsx — the editable preset JSON on a REAL scanned library
// (fake folder of approved pairs → real discovery, selection, layout, compose
// and UI). Covers FIXES A1–A7, B1–B8 and the reference controls in §C.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";
import { setIndexRuntime } from "../src/svgBuilder/indexer/runtime";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async () => null) };
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
const FOOD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>';
const FOOD = ["apple", "bread", "cake", "donut", "egg"];
const UI = ["home", "gear", "bell", "user", "mail", "lock", "star"];

function addPair(root: FakeDir, dir: string, stem: string, svg = SVG): void {
  let node = root;
  for (const part of dir.split("/")) {
    const next = node.children.get(part);
    if (next instanceof FakeDir) { node = next; continue; }
    const made = new FakeDir(part); node.children.set(part, made); node = made;
  }
  const meta = serializePairMeta(pairFile(dir, `${stem}_AI.png`, { versions: [svgVersion(`${dir}/${stem}_AI.svg`, { version: 1, review: "approved" })] }));
  node.children.set(`${stem}_AI.png`, new FakeFile(`${stem}_AI.png`, 20, 3100, "ai"));
  node.children.set(`${stem}_AI.svg`, new FakeFile(`${stem}_AI.svg`, svg.length, 3400, svg));
  node.children.set(`${stem}_AI.svg.json`, new FakeFile(`${stem}_AI.svg.json`, meta.length, 3500, meta));
}

function library(): FakeDir {
  const root = new FakeDir("icons");
  FOOD.forEach((s) => addPair(root, "food icons", s, FOOD_SVG));
  UI.forEach((s) => addPair(root, "interface", s));
  return root;
}

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const all = (sel: string) => [...host.querySelectorAll(sel)] as HTMLElement[];
const text = (id: string) => q(id)?.textContent ?? "";
const click = async (id: string) => {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
};

async function openLibrary(): Promise<void> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => text("builder-library-count") === "12", "library scanned");
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  stored.clear();
  resetAppStore();
  const dir = library();
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => dir;
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
});

afterEach(() => {
  setIndexRuntime(null);
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.unstubAllGlobals();
});


import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";

// Saved sheet templates (2026-11-13): the look (grid, icon, banner and text style)
// saved as compact blocks under the builder — removable, editable, renamable.

import { assetFromRow } from "../src/lib/svgBuilder/assets";
import { mergeConfig, presetBriefForAi, presetJsonOf, readPresetJson, resolveIcons, PRESET_FORMAT } from "../src/lib/svgBuilder/presetjson";
import { DEFAULT_SELECTION_RECIPE } from "../src/lib/svgBuilder/selection";

// The editable preset JSON (2026-11-13): the whole sheet — colours, sizes,
// margins, banner text and placement, icons by NAME — editable and pasteable,
// merged onto the sheet, with a guide an AI can use to write similar presets.

const row = (id: string, base: string) => ({
  id, base, suffix: "", dirPath: "icons/food", svgPath: `icons/food/${base}_AI.svg`, svgName: `${base}_AI.svg`,
  version: 1, fingerprint: `f-${id}`, metaPath: `icons/food/${base}_AI.svg.json`,
});
const ASSETS = [
  assetFromRow(row("p1", "chicken-leg"), { title: "Roast chicken leg", description: "", tags: [], name: "chicken" }),
  assetFromRow(row("p2", "soup-bowl"), { title: "Hot soup bowl", description: "", tags: [] }),
  assetFromRow(row("p3", "mixer")),
];

describe("preset JSON — the pure part", () => {
  it("writes the icons by name (id kept), empty cells as null, trailing holes dropped", () => {
    const json = presetJsonOf({ name: "Food", config: DEFAULT_CONFIG, placedIds: ["p1", "~empty:0", "p3", "~empty:1"], lockedIds: ["p3"],
      seed: 7, recipe: DEFAULT_SELECTION_RECIPE, metadata: null, assets: ASSETS });
    expect(json).toMatchObject({ format: PRESET_FORMAT, version: 2, name: "Food", seed: 7, lockedIcons: ["mixer"] });
    expect(json.icons).toEqual([{ name: "chicken", id: "p1" }, null, { name: "mixer", id: "p3" }]);
  });

  it("merges a partial config onto the sheet and clamps it", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { banner: { background: "#A8EFE4", titleDx: 9999 }, grid: { columns: 5, rows: 3 } });
    expect(merged.banner).toMatchObject({ background: "#A8EFE4", titleDx: 400, title: DEFAULT_CONFIG.banner.title, accent: DEFAULT_CONFIG.banner.accent });
    expect(merged.grid).toMatchObject({ columns: 5, rows: 3, gapX: DEFAULT_CONFIG.grid.gapX });
    expect(merged.icons).toEqual(DEFAULT_CONFIG.icons);
  });

  it("finds icons by Icon Name, title, file name or id; reports the rest; null leaves a cell empty", () => {
    const r = resolveIcons(["CHICKEN", { title: "hot soup bowl" }, null, { file: "mixer" }, "unicorn", "chicken"], ASSETS);
    expect(r.ids.slice(0, 2)).toEqual(["p1", "p2"]);
    expect(r.ids[2]).toMatch(/^~empty:/);
    expect(r.ids[3]).toBe("p3");
    expect(r.ids[4]).toMatch(/^~empty:/); // not found → an empty cell, never a guess
    expect(r.ids[5]).toMatch(/^~empty:/); // the same icon twice → the second cell stays empty
    expect(r.unresolved).toEqual(["unicorn"]);
    expect(resolveIcons([{ id: "p2" }], ASSETS).ids).toEqual(["p2"]);
  });

  it("reads pasted JSON: bad JSON says why, no icons keeps the placement, old id presets still load", () => {
    expect(readPresetJson("{ nope", DEFAULT_CONFIG, ASSETS)).toMatchObject({ ok: false });
    expect(readPresetJson("[1]", DEFAULT_CONFIG, ASSETS)).toMatchObject({ ok: false, error: expect.stringMatching(/object/) });
    const style = readPresetJson(JSON.stringify({ config: { icons: { color: "#6B3FA0" } } }), DEFAULT_CONFIG, ASSETS);
    expect(style.ok && style.preset.placedIds).toBeNull();
    expect(style.ok && style.preset.config.icons.color).toBe("#6B3FA0");
    const legacy = readPresetJson(JSON.stringify({ placedIds: ["p3", "gone"], seed: 4 }), DEFAULT_CONFIG, ASSETS);
    expect(legacy.ok && legacy.preset.placedIds?.[0]).toBe("p3");
    expect(legacy.ok && legacy.preset.unresolved).toEqual(["gone"]);
    expect(legacy.ok && legacy.preset.seed).toBe(4);
  });

  it("gives an AI the format, every parameter, the current JSON and the Icon Names", () => {
    const brief = presetBriefForAi({ format: PRESET_FORMAT }, ASSETS);
    expect(brief).toMatch(/ONE JSON object only/);
    expect(brief).toMatch(/titleDx\/titleDy/);
    expect(brief).toMatch(/textPadding/);
    for (const name of ["chicken", "Hot soup bowl", "mixer"]) expect(brief).toContain(name);
    expect(brief).toMatch(/Available Icon Names \(3\)/);
  });
});

const placedNow = () => all('[data-testid^="builder-asset-"][data-selected="true"]').map((el) => el.dataset.assetId ?? "");
const box = () => q("builder-preset-json-text") as HTMLTextAreaElement;
async function setBox(value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => { setter.call(box(), value); box().dispatchEvent(new Event("input", { bubbles: true })); });
}
const sheetSvg = () => q("builder-artboard")!.querySelector(".bld-artboard-svg")!.shadowRoot!.innerHTML;

describe("preset JSON — the window", () => {
  it("shows the sheet as JSON, applies pasted JSON (colours, text, icons by name) and reports missing icons", async () => {
    await openLibrary();
    await click("builder-open-preset-json");
    const shown = JSON.parse(box().value);
    expect(shown.format).toBe("iconsplitter-sheet-preset");
    expect(shown.icons.length).toBe(12);
    expect(typeof shown.icons[0].name).toBe("string");

    await setBox(JSON.stringify({
      config: { grid: { columns: 5, rows: 3 }, banner: { background: "#A8EFE4", title: "Food Icon Assets", titleDy: 6 }, icons: { color: "#6B3FA0" } },
      icons: ["apple", "bread", null, "unicorn", "cake"],
    }));
    await click("builder-preset-json-apply");
    await settle(0);
    expect(text("builder-preset-json-status")).toMatch(/1 icon\(s\) not found.*unicorn/);
    await waitUntil(() => sheetSvg().includes("#A8EFE4") && sheetSvg().includes("Food Icon Assets"), "the sheet redrawn");
    expect(sheetSvg()).toContain('color="#6B3FA0"'); // icons stroke with currentColor
    expect(text("builder-cells")).toContain("of 15 cells");
    expect(placedNow()).toHaveLength(3); // apple, bread, cake — nothing invented for the rest
    const picked = all('[data-testid^="builder-asset-"][data-selected="true"]').map((el) => el.getAttribute("title") ?? "").join(" ").toLowerCase();
    for (const name of ["apple", "bread", "cake"]) expect(picked).toContain(name);
    expect(JSON.parse(box().value).config.banner.title).toBe("Food Icon Assets"); // the box shows the applied sheet
  });

  it("refuses broken JSON and leaves the sheet alone", async () => {
    await openLibrary();
    const before = sheetSvg();
    await click("builder-open-preset-json");
    await setBox("{ \"config\": ");
    await click("builder-preset-json-apply");
    expect(text("builder-preset-json-status")).toMatch(/not valid JSON/);
    expect(sheetSvg()).toBe(before);
    expect(q("builder-preset-json")).not.toBeNull(); // the window stays open to fix it
  });

  it("is in the Export menu too", async () => {
    await openLibrary();
    await click("builder-export-toggle");
    await click("builder-export-preset-json");
    expect(q("builder-preset-json")).not.toBeNull();
    await click("builder-preset-json-close");
    expect(q("builder-preset-json")).toBeNull();
  });
});
