// @vitest-environment happy-dom
// svg_builder_artboards.test.tsx — final artboards on a REAL scanned library
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

import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { artboardConfig, artboardName, newArtboard, parseArtboards, pendingUse } from "../src/lib/svgBuilder/artboards";
import { BUILDER_ARTBOARDS_KEY } from "../src/svgBuilder/artboardstore";

// Final artboards (2026-11-13): a template is the blueprint; each artboard is one
// sheet built from it with its own icons, words and metadata, listed under the
// templates with the same row gestures as every other list.

describe("final artboards — the pure part", () => {
  const tpl = newTemplate(parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, title: "kept out" } }), [], "t0", "tpl-1");

  it("names artboards after the template with the next free number", () => {
    const a1 = newArtboard(tpl, [], "t1", "a1");
    expect(a1.name).toBe(`${tpl.name} — #1`);
    expect(artboardName(tpl, [a1])).toBe(`${tpl.name} — #2`);
    expect(a1).toMatchObject({ templateId: "tpl-1", title: "", placedIds: [], metadata: null, exportedAt: null });
  });

  it("draws with the template's look and its own words", () => {
    const a = { ...newArtboard(tpl, [], "t1", "a1"), title: "Food Icon Assets", subtitle: "Editable stroke" };
    const config = artboardConfig(tpl, a);
    expect(config.banner).toMatchObject({ title: "Food Icon Assets", subtitle: "Editable stroke", background: tpl.config.banner.background });
    expect(config.grid).toEqual(tpl.config.grid);
  });

  it("counts icons on artboards not exported yet as pending use", () => {
    const a = { ...newArtboard(tpl, [], "t", "a"), placedIds: ["p1", "~empty:0", "p2"] };
    const b = { ...newArtboard(tpl, [a], "t", "b"), placedIds: ["p1"] };
    const done = { ...newArtboard(tpl, [a, b], "t", "c"), placedIds: ["p2"], exportedAt: "2026-11-13" };
    expect(Object.fromEntries(pendingUse([a, b, done]))).toEqual({ p1: 2, p2: 1 });
  });

  it("reads the saved list field by field and drops artboards of removed templates", () => {
    const a = newArtboard(tpl, [], "t", "a");
    expect(parseArtboards([a, { ...a }, { id: "x", templateId: "gone", name: "x" }, 5], new Set(["tpl-1"])).map((x) => x.id)).toEqual(["a"]);
    expect(parseArtboards("junk")).toEqual([]);
  });
});

const rows = () => all('[data-testid^="builder-artboard-art-"]').filter((el) => el.classList.contains("bld-artboard-row"));
const savedArtboards = () => JSON.parse(localStorage.getItem(BUILDER_ARTBOARDS_KEY) ?? "[]") as Array<{ id: string; name: string; title: string; placedIds: string[]; templateId: string }>;
const savedTemplates = () => JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.templates.v1") ?? "[]") as Array<{ id: string }>;
const realIcons = (ids: string[]) => ids.filter((id) => !id.startsWith("~empty:"));
const tiles = () => all('[data-testid^="builder-asset-"]').filter((el) => el.dataset.assetId !== undefined);
async function clickWith(id: string, init: MouseEventInit): Promise<void> {
  const el = q(id)!;
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init })); });
  await settle(0);
}
async function typeIn(id: string, value: string): Promise<void> {
  const input = q(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); input.blur(); });
  await settle(0);
}

describe("final artboards — the list under the templates", () => {
  it("adds an empty artboard from a template, fills it on the stage and keeps each artboard's own icons and words", async () => {
    await openLibrary();
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    expect(q("builder-artboards-hint")).not.toBeNull(); // nothing selected yet

    await click(`builder-template-add-artboard-${tpl.id}`);
    const [first] = savedArtboards();
    expect(rows()).toHaveLength(1);
    expect(text("builder-cells")).toContain("0 of 32 cells"); // a new artboard asks for icons
    expect(q(`builder-artboard-${first.id}`)?.className).toContain("is-open");

    await act(async () => { tiles()[0].dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle(0);
    await typeIn("builder-title", "Food Icon Assets");
    await waitUntil(() => realIcons(savedArtboards()[0].placedIds).length === 1 && savedArtboards()[0].title === "Food Icon Assets", "artboard written back");
    expect(text(`builder-artboard-${first.id}`)).toContain("1/32 icons");

    await click(`builder-artboard-add-${tpl.id}`); // a second one opens empty
    expect(text("builder-cells")).toContain("0 of 32 cells");
    expect((q("builder-title") as HTMLInputElement).value).toBe("");
    await clickWith(`builder-artboard-${first.id}`, {}); // back to the first: its icon and title return
    expect(text("builder-cells")).toContain("1 of 32 cells");
    expect((q("builder-title") as HTMLInputElement).value).toBe("Food Icon Assets");
    expect(realIcons(savedArtboards()[1].placedIds)).toHaveLength(0); // the second never got the first's icons
  });

  it("checked templates show their artboards together; rows check with the RULE 25 gestures; bulk remove", async () => {
    await openLibrary();
    await click("builder-template-save");
    await click("builder-template-save-new");
    const [t1, t2] = savedTemplates();
    await click(`builder-template-add-artboard-${t1.id}`);
    await click(`builder-template-add-artboard-${t2.id}`);
    await click(`builder-template-add-artboard-${t2.id}`);
    await click("builder-templates-check-all");
    expect(q(`builder-artboard-group-${t1.id}`)).not.toBeNull();
    expect(q(`builder-artboard-group-${t2.id}`)).not.toBeNull();
    expect(rows()).toHaveLength(3);

    const [a1, a2, a3] = savedArtboards();
    await clickWith(`builder-artboard-${a1.id}`, {}); // plain click: active, not checked
    expect(text("builder-artboards-checked")).toBe("0 checked");
    await clickWith(`builder-artboard-${a3.id}`, { shiftKey: true }); // range in visible order
    expect(text("builder-artboards-checked")).toBe("3 checked");
    await clickWith(`builder-artboard-${a2.id}`, { ctrlKey: true }); // toggle one
    expect(text("builder-artboards-checked")).toBe("2 checked");
    await click("builder-artboards-remove");
    expect(savedArtboards().map((a) => a.id)).toEqual([a2.id]);

    await click(`builder-template-check-${t2.id}`); // only t1 checked now → its group alone
    expect(q(`builder-artboard-group-${t2.id}`)).toBeNull();
  });

  it("asks for the key before any artboard metadata request", async () => {
    await openLibrary();
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    const [a] = savedArtboards();
    await click(`builder-artboard-check-${a.id}`);
    await click("builder-artboards-metadata");
    expect(text("builder-toast")).toMatch(/Gemini API key/);
    expect(q("builder-artboards-meta-dialog")).toBeNull();
  });
});
