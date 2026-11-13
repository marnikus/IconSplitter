// @vitest-environment happy-dom
// svg_builder_iconmap.test.tsx — icon map and usage on a REAL scanned library
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
let scanned: FakeDir;
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
  scanned = dir;
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

import { iconMapOf, ICON_MAP_FILE } from "../src/lib/svgBuilder/iconmap";
import { bumpUsage, emptyUsage, parseUsageRecord, usagePathOf } from "../src/lib/svgBuilder/usage";
import { assetFromRow } from "../src/lib/svgBuilder/assets";

// icon-map.json (2026-11-13): every named icon → id, folder and files, written
// in the scanned root after each scan so an AI can find an icon by name or id.

const row = (id: string, base: string, dir = "food/split_01") => ({
  id, base, suffix: "", dirPath: dir, svgPath: `${dir}/${base}_AI.svg`, svgName: `${base}_AI.svg`,
  version: 1, fingerprint: `f-${id}`, metaPath: `${dir}/${base}_AI.svg.json`, aiPath: `${dir}/${base}_AI.png`,
});

describe("icon map — the pure part", () => {
  it("maps every icon with an Icon Name to its id, folder and files; unnamed icons are left out", () => {
    const assets = [
      assetFromRow(row("pair_2", "harvest-basket"), { title: "Harvest basket", description: "", tags: [], name: "harvest" }),
      assetFromRow(row("pair_1", "chicken-leg", "food/split_02"), { title: "Roast chicken", description: "", tags: [], name: "chicken" }),
      assetFromRow(row("pair_3", "mixer")),
    ];
    const map = iconMapOf(assets, "F:\\Stocks 2026\\icons");
    expect(map).toMatchObject({ format: "iconsplitter-icon-map", version: 1, root: "F:\\Stocks 2026\\icons", count: 2 });
    expect(map.icons.map((i) => i.name)).toEqual(["chicken", "harvest"]); // sorted, stable between scans
    expect(map.icons[1]).toEqual({
      name: "harvest", id: "pair_2", title: "Harvest basket", folder: "food/split_01",
      folderPath: "F:\\Stocks 2026\\icons\\food\\split_01",
      files: {
        svg: "food/split_01/harvest-basket_AI.svg", svgJson: "food/split_01/harvest-basket_AI.svg.json",
        preview: "food/split_01/harvest-basket_AI.png", exportJson: "food/split_01/export/export.json",
        index: "food/split_01/harvest-basket_AI.svg.index.json", usage: "food/split_01/harvest-basket_AI.svg.usage.json",
      },
    });
    expect(iconMapOf(assets, "").icons[0].folderPath).toBeNull(); // the root's full path is not known yet
  });
});

describe("usage record — the pure part", () => {
  it("counts exported artboards and keeps the newest history first", () => {
    const first = bumpUsage(emptyUsage("pair_1", "a/x_AI.svg"), "art-1", "2026-11-13T10:00:00Z");
    const second = bumpUsage(first, "art-2", "2026-11-13T11:00:00Z");
    expect(second).toMatchObject({ used: 2, last: "2026-11-13T11:00:00Z" });
    expect(second.history.map((h) => h.artboard)).toEqual(["art-2", "art-1"]);
    expect(usagePathOf("a/x_AI.svg")).toBe("a/x_AI.svg.usage.json");
    expect(parseUsageRecord({ id: "pair_1", svgPath: "a", used: -3, history: [{ at: 1 }] })).toMatchObject({ used: 0, history: [] });
    expect(parseUsageRecord({ used: 2 })).toBeNull();
  });
});

/** A pair's export record with an Icon Name, the way the SVG to upload tab writes it. */
function addExportName(rootDir: FakeDir, dir: string, stem: string, name: string, pairIdOf: string): void {
  let node = rootDir;
  for (const part of [...dir.split("/"), "export"]) {
    const next = node.children.get(part);
    if (next instanceof FakeDir) { node = next; continue; }
    const made = new FakeDir(part); node.children.set(part, made); node = made;
  }
  const record = JSON.stringify({
    v: 1, pair: { id: pairIdOf, base: stem, suffix: "", dir }, source: { svgPath: "", version: 1, approval: "approved", fingerprint: "f" },
    settings: { fingerprint: "s" }, tools: { svgo: {}, eps: {} }, outputs: { svg: null, jpg: null, eps: null }, timestamps: { preparedAt: "" },
    metadata: { state: "accepted", title: `${stem} icon title`, description: "", tags: ["x"], name },
  });
  node.children.set("export.json", new FakeFile("export.json", record.length, 3600, record));
}

describe("icon map — written after a scan, shown in the folder bar", () => {
  it("writes icon-map.json in the scanned root and shows where it is", async () => {
    await openLibrary();
    const apple = all('[data-testid^="builder-asset-"]').find((el) => (el.getAttribute("title") ?? "").toLowerCase().includes("apple"))!;
    addExportName(scanned, "food icons", "apple", "apple", apple.dataset.assetId!);
    await click("builder-rescan");
    await waitUntil(() => text("builder-icon-map-count").includes("1 named icon"), "icon map refreshed");
    const file = scanned.children.get(ICON_MAP_FILE) as FakeFile | undefined;
    expect(file).toBeDefined();
    const map = JSON.parse(file!.text);
    expect(map.icons).toHaveLength(1);
    expect(map.icons[0]).toMatchObject({ name: "apple", id: apple.dataset.assetId, folder: "food icons" });
    expect(map.icons[0].files.preview).toBe("food icons/apple_AI.png");
    expect(text("builder-icon-map-path")).toContain("icon-map.json");
  });
});
