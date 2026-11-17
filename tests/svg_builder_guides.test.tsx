// @vitest-environment happy-dom
// svg_builder_guides.test.tsx — layout guides on a REAL scanned library
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

import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { sheetGuides } from "../src/lib/svgBuilder/guides";
import { RANGES } from "../src/lib/svgBuilder/ranges";

// Red layout guides over the artboard and the 240 px icon box (2026-11-13).

describe("guides and box size — the pure part", () => {
  it("allows icon boxes up to 240 px and clamps above", () => {
    expect(RANGES.box.max).toBe(240);
    expect(parseSheetConfig({ icons: { box: 200 } }).icons.box).toBe(200);
    expect(parseSheetConfig({ icons: { box: 999 } }).icons.box).toBe(240);
  });

  it("gives every box, the icon area inside it, the column/row edges, the padding and the banner", () => {
    const config = parseSheetConfig({ ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 3, rows: 2 } });
    const layout = computeLayout(config);
    const g = sheetGuides(layout);
    expect(g.cells).toHaveLength(6);
    expect(g.glyphs).toHaveLength(6);
    expect(g.vertical).toHaveLength(6); // 3 columns × left/right edge
    expect(g.horizontal).toHaveLength(4); // 2 rows × top/bottom edge
    expect(g.glyphs[0].width).toBeLessThan(g.cells[0].width); // the small padding inside the box
    expect(g.glyphs[0].x).toBeGreaterThan(g.cells[0].x);
    expect(g.content).toEqual(layout.content);
    expect(g.banner).toEqual(layout.banner);
  });
});

describe("guides on the artboard", () => {
  it("▦ Guides shows the red grid over the artboard, the slider sets its opacity, both remembered", async () => {
    await openLibrary();
    expect(q("builder-guides")).toBeNull(); // off by default
    await click("builder-toggle-guides");
    const svg = q("builder-guides")!;
    expect(svg).not.toBeNull();
    expect(svg.querySelectorAll('[data-guide="cell"]')).toHaveLength(32);
    expect(svg.querySelectorAll('[data-guide="icon"]')).toHaveLength(32);
    expect(svg.querySelectorAll('[data-guide="column"]').length).toBe(16);
    expect(svg.querySelector('[data-guide="padding"]')).not.toBeNull();
    expect(svg.querySelector('[data-guide="banner"]')).not.toBeNull();

    const slider = q("builder-guide-opacity") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(slider, "25"); slider.dispatchEvent(new Event("input", { bubbles: true })); slider.dispatchEvent(new Event("change", { bubbles: true })); });
    expect((q("builder-guides") as unknown as SVGElement).style.opacity).toBe("0.25");
    const prefs = JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.prefs.v1") ?? "{}");
    expect(prefs).toMatchObject({ showGuides: true, guideOpacity: 25 });

    await click("builder-toggle-guides");
    expect(q("builder-guides")).toBeNull();
    expect(q("builder-guide-opacity")).toBeNull();
  });
});
