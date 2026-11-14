// @vitest-environment happy-dom
// svg_builder_templates.test.tsx — saved templates on a REAL scanned library
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
import {
  applyTemplate, lookOf, newTemplate, parseTemplates, templateName, templatePreviewSvg,
} from "../src/lib/svgBuilder/templates";
import { BUILDER_TEMPLATES_KEY } from "../src/svgBuilder/templatestore";

// Saved sheet templates (2026-11-13): the look (grid, icon, banner and text style)
// saved as compact blocks under the builder — removable, editable, renamable.

describe("templates — the pure part", () => {
  const sheet = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, title: "FOOD", subtitle: "Line icons", heroIconId: "x" } });

  it("keeps the look with the words as sample text (never empty), and no hero (2026-11-14)", () => {
    const look = lookOf(sheet);
    expect(look.banner).toMatchObject({ title: "FOOD", subtitle: "Line icons", heroIconId: null, style: sheet.banner.style });
    expect(look.grid).toEqual(sheet.grid);
    const blank = lookOf(parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, title: " ", subtitle: "" } }));
    expect(blank.banner).toMatchObject({ title: DEFAULT_CONFIG.banner.title, subtitle: DEFAULT_CONFIG.banner.subtitle });
  });

  it("applies a look to the current sheet without rewriting its words", () => {
    const other = parseSheetConfig({ ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 5 }, banner: { ...DEFAULT_CONFIG.banner, position: "top", style: "split" } });
    const template = newTemplate(other, [], "2026-11-13T00:00:00Z", "t1");
    const applied = applyTemplate(sheet, template);
    expect(applied.grid.columns).toBe(5);
    expect(applied.banner).toMatchObject({ position: "top", style: "split", title: "FOOD", subtitle: "Line icons", heroIconId: "x" });
  });

  it("generates a name from the look and numbers a taken one", () => {
    expect(templateName(sheet, [])).toBe("Side banner · 8×4 · Solid");
    expect(templateName(sheet, ["side banner · 8×4 · solid"])).toBe("Side banner · 8×4 · Solid 2");
    const plain = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "none" } });
    expect(templateName(plain, [])).toBe("Plain grid · 8×4");
  });

  it("reads the saved list field by field: junk drops, a duplicate id keeps the first", () => {
    const good = newTemplate(sheet, [], "2026-11-13T00:00:00Z", "a");
    const list = parseTemplates([good, { ...good, name: "dup" }, { id: "", name: "x", config: {} }, { id: "b", name: "   " }, 7, null]);
    expect(list.map((t) => t.id)).toEqual(["a"]);
    expect(parseTemplates("junk")).toEqual([]);
  });

  it("draws a dashed outline for every cell without a loaded icon", () => {
    const template = newTemplate(sheet, [], "2026-11-13T00:00:00Z", "a");
    const svg = templatePreviewSvg({ template, assets: [], placedIds: [], svgTexts: {} });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/stroke-dasharray="4 4"/g)?.length).toBe(32);
    expect(svg).toContain("FOOD"); // the template's sample title is what its block shows
  });
});

async function typeInto(id: string, value: string): Promise<void> {
  const input = q(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); input.blur(); });
  await settle(0);
}

const blocks = () => all('[data-testid^="builder-template-"]').filter((el) => el.tagName === "ARTICLE");
const saved = () => JSON.parse(localStorage.getItem(BUILDER_TEMPLATES_KEY) ?? "[]") as Array<{ id: string; name: string; config: { grid: { columns: number; rows: number } } }>;

describe("templates — the window under the builder", () => {
  it("saves, renames, opens to edit, saves back and removes a template", async () => {
    await openLibrary();
    expect(q("builder-templates-empty")).not.toBeNull();
    // the window is its own card after the workspace
    expect(q("builder-workspace")!.nextElementSibling).toBe(q("builder-templates"));

    await click("builder-template-save");
    expect(blocks()).toHaveLength(1);
    const [first] = saved();
    expect(first.name).toBe("Side banner · 8×4 · Solid");
    expect((q(`builder-template-name-${first.id}`) as HTMLInputElement).value).toBe(first.name);
    expect(q(`builder-template-preview-${first.id}`)?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(text("builder-template-editing")).toContain(first.name); // a new template is the one being edited

    await typeInto(`builder-template-name-${first.id}`, "  Food   catalogue  ");
    expect(saved()[0].name).toBe("Food catalogue");

    await click("builder-template-stop");
    await click("builder-columns-inc"); // the sheet moves away from the template
    expect(text("builder-cells")).toContain("of 36 cells");
    await click(`builder-template-edit-${first.id}`); // ✎ opens its design again: the look comes back
    expect(text("builder-cells")).toContain("of 32 cells");
    expect(q(`builder-template-${first.id}`)?.className).toContain("is-editing");

    await click("builder-rows-dec");
    await click("builder-template-save"); // writes back into the one being edited
    expect(saved()).toHaveLength(1);
    expect(saved()[0].config.grid.rows).toBe(3);
    expect(saved()[0].name).toBe("Food catalogue");

    await click("builder-template-save-new");
    expect(saved()).toHaveLength(2);
    await click(`builder-template-remove-${first.id}`);
    expect(saved().map((t) => t.id)).not.toContain(first.id);
    expect(blocks()).toHaveLength(1);
  });

  it("opening a template is one undo step", async () => {
    await openLibrary();
    await click("builder-template-save");
    const [first] = saved();
    await click("builder-template-stop");
    await click("builder-columns-inc");
    await click(`builder-template-edit-${first.id}`);
    expect(text("builder-cells")).toContain("of 32 cells");
    await click("builder-undo");
    expect(text("builder-cells")).toContain("of 36 cells");
  });
});

describe("indexing controls", () => {
  it("sit in the header row beside the sheet title, not in the folder bar (2026-11-13)", async () => {
    await click("tab-svg-builder");
    expect(q("builder-header")!.contains(q("builder-index-start"))).toBe(true);
    expect(q("builder-folder-widget")!.contains(q("builder-index-start"))).toBe(false);
    expect(q("builder-header-index")!.previousElementSibling?.className).toContain("bld-title-block");
  });
});

// 2026-11-13, second request: text placement (padding + exact moves), editing the
// banner text right on the sheet, and a zoom for the template pictures.
import { bannerMarkup } from "../src/lib/svgBuilder/banner";

describe("text placement — the pure part", () => {
  const box = { x: 0, y: 0, width: 1080, height: 76 };
  const draw = (patch: Partial<typeof DEFAULT_CONFIG.banner>) => bannerMarkup({
    banner: { ...DEFAULT_CONFIG.banner, position: "top", style: "split", ...patch }, box, artboardWidth: 1080,
    title: "GLYPH / ICON SHEET", subtitle: "Approved SVG assets", hero: () => "",
  });

  it("marks each text block and moves it by exact pixels", () => {
    expect(draw({})).toContain('<g data-banner-text="title">');
    const moved = draw({ titleDx: 12, titleDy: -3, subtitleDx: -40, subtitleDy: 5 });
    expect(moved).toContain('<g data-banner-text="title" transform="translate(12 -3)">');
    expect(moved).toContain('<g data-banner-text="subtitle" transform="translate(-40 5)">');
  });

  it("text padding moves the title AND the subtitle together, never the painted block (2026-11-14)", () => {
    const padded = draw({ textPadding: 60 }); // Top split: in from the left edge
    expect(padded).toContain('<g data-banner-text="title" transform="translate(60 0)">');
    expect(padded).toContain('<g data-banner-text="subtitle" transform="translate(60 0)">');
    expect(padded).toContain(`<rect x="0" y="0" width="`); // the accent block still starts at the edge
    const moved = draw({ textPadding: 20, titleDx: 5, subtitleDy: -3 }); // padding adds to the moves
    expect(moved).toContain('<g data-banner-text="title" transform="translate(25 0)">');
    expect(moved).toContain('<g data-banner-text="subtitle" transform="translate(20 -3)">');
    const side = bannerMarkup({
      banner: { ...DEFAULT_CONFIG.banner, position: "left", style: "solid", textPadding: 30 }, box: { x: 0, y: 0, width: 242, height: 660 },
      artboardWidth: 1080, title: "Food Icon Assets", subtitle: "Editable stroke", hero: () => "",
    });
    expect(side).toContain('<g data-banner-text="title" transform="translate(0 30)">'); // a side banner: down
    expect(side).toContain('<g data-banner-text="subtitle" transform="translate(0 30)">');
  });

  it("reads old configs as no placement, clamps the rest, and a template keeps it", () => {
    expect(parseSheetConfig({ banner: { title: "x" } }).banner).toMatchObject({ textPadding: 0, titleDx: 0, subtitleDy: 0 });
    expect(parseSheetConfig({ banner: { titleDx: 9000, textPadding: -5 } }).banner).toMatchObject({ titleDx: 400, textPadding: 0 });
    const placed = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, titleDx: 7, textPadding: 20 } });
    expect(lookOf(placed).banner).toMatchObject({ titleDx: 7, textPadding: 20 });
  });
});

const shadowSvg = () => q("builder-artboard")!.querySelector(".bld-artboard-svg")!.shadowRoot!;

describe("text placement and in-place editing — on the sheet", () => {
  it("Move X / Y and Text padding change the drawn sheet", async () => {
    await openLibrary();
    await typeInto("builder-title-move-x", "15");
    await waitUntil(() => shadowSvg().innerHTML.includes('data-banner-text="title" transform="translate(15 0)"'), "title moved");
    expect(q("builder-text-placement-reset")?.hasAttribute("disabled")).toBe(false);
    await click("builder-text-placement-reset");
    await waitUntil(() => shadowSvg().innerHTML.includes('<g data-banner-text="title">'), "placement reset");
  });

  it("double-click edits the title on the sheet; clicking outside saves, Escape cancels", async () => {
    await openLibrary();
    const title = () => shadowSvg().querySelector('[data-banner-text="title"]')!;
    await act(async () => { title().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true })); });
    const box = q("builder-inline-title") as HTMLTextAreaElement;
    expect(box).not.toBeNull();
    expect(box.value).toBe("ICON SHEET");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => { setter.call(box, "Fresh food"); box.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { box.blur(); box.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await settle(0);
    expect(q("builder-inline-title")).toBeNull();
    expect((q("builder-title") as HTMLInputElement).value).toBe("Fresh food");
    expect(text("builder-sheet-title")).toBe("Fresh food");

    await act(async () => { title().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true })); });
    const again = q("builder-inline-title") as HTMLTextAreaElement;
    await act(async () => { setter.call(again, "thrown away"); again.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { again.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await settle(0);
    expect((q("builder-title") as HTMLInputElement).value).toBe("Fresh food");

    await click("builder-undo"); // the in-place edit was one undo entry
    expect((q("builder-title") as HTMLInputElement).value).toBe("ICON SHEET");
  });
});

describe("template pictures zoom", () => {
  it("sizes every picture by the shared 48–800 px zoom and remembers it", async () => {
    await openLibrary();
    expect(q("builder-template-zoom")).toBeNull(); // nothing to zoom yet
    await click("builder-template-save");
    const zoom = q("builder-template-zoom") as HTMLInputElement;
    expect([zoom.min, zoom.max]).toEqual(["48", "800"]);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(zoom, "300"); zoom.dispatchEvent(new Event("input", { bubbles: true })); zoom.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(text("builder-template-zoom-value")).toContain("300");
    expect((host.querySelector(".bld-templates-grid") as HTMLElement).style.getPropertyValue("--tpl-h")).toBe("300px");
    expect(JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.prefs.v1") ?? "{}").templateZoom).toBe(300);
  });
});

// 2026-11-14: a template shows sample text while it is styled; final artboards
// replace it with their own words.
import { artboardPreviewSvg, newArtboard } from "../src/lib/svgBuilder/artboards";

describe("template sample text", () => {
  it("a final artboard never draws the template's sample words", () => {
    const tpl = newTemplate(parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, title: "SAMPLE HEAD" } }), [], "t", "tpl");
    const art = { ...newArtboard(tpl, [], "t", "a1"), title: "Fresh food" };
    const svg = artboardPreviewSvg({ template: tpl, artboard: art, assets: [], svgTexts: {} });
    expect(svg).toContain("Fresh food");
    expect(svg).not.toContain("SAMPLE HEAD");
    expect(templatePreviewSvg({ template: tpl, assets: [], placedIds: [], svgTexts: {} })).toContain("SAMPLE HEAD");
  });

  it("✎ opens the template with its sample words, saving keeps edited sample words", async () => {
    await openLibrary();
    await typeInto("builder-title", "Sample heading");
    await click("builder-template-save");
    const [first] = saved();
    await click("builder-template-stop");
    await typeInto("builder-title", "Something else");
    await click(`builder-template-edit-${first.id}`);
    expect((q("builder-title") as HTMLInputElement).value).toBe("Sample heading"); // the sample, not the sheet's words
    await typeInto("builder-title", "New sample");
    await click("builder-template-save");
    expect(JSON.parse(localStorage.getItem(BUILDER_TEMPLATES_KEY) ?? "[]")[0].config.banner.title).toBe("New sample");
  });
});
