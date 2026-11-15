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

import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { artboardConfig, artboardName, artboardsWithout, newArtboard, parseArtboards, pendingUse, withSheetAnswer } from "../src/lib/svgBuilder/artboards";
import { acceptSheetMetadata } from "../src/lib/svgBuilder/metadata";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { overrideCount, overridesOf } from "../src/lib/svgBuilder/lookoverrides";
import { BUILDER_ARTBOARDS_KEY } from "../src/svgBuilder/artboardstore";

// Final artboards (2026-11-13): a template is the blueprint; each artboard is one
// sheet built from it with its own icons, words and metadata, listed under the
// templates with the same row gestures as every other list.

describe("final artboards — the pure part", () => {
  const tpl = newTemplate(parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, title: "kept out" } }), [], "t0", "tpl-1");

  it("an artboard keeps only the look parts it changed; everything else follows its template (2026-11-14)", () => {
    const stage = { ...tpl.config, banner: { ...tpl.config.banner, background: "#112233", title: "Own words" }, artboard: { ...tpl.config.artboard, padding: 77 } };
    expect(overridesOf(tpl, stage)).toEqual({ banner: { background: "#112233" }, artboard: { padding: 77 } }); // words are never overrides
    expect(overridesOf(tpl, parseSheetConfig(tpl.config))).toEqual({});
    const art = { ...newArtboard(tpl, [], { now: "t", id: "a" }), overrides: { banner: { background: "#112233" } } };
    const changed = { ...tpl, config: { ...tpl.config, banner: { ...tpl.config.banner, background: "#FFFFFF" }, icons: { ...tpl.config.icons, color: "#AA0000" } } };
    const drawn = artboardConfig(changed, art);
    expect(drawn.banner.background).toBe("#112233"); // its own change wins
    expect(drawn.icons.color).toBe("#AA0000"); // not changed on it: inherited from the template
    expect(overrideCount(art.overrides)).toBe(1);
    const parsed = parseArtboards([{ ...art, overrides: { banner: { background: "#112233", bogus: 1 }, nope: { x: 1 }, grid: "junk" } }]);
    expect(parsed[0].overrides).toEqual({ banner: { background: "#112233" } });
    expect(parseArtboards([{ ...art, overrides: undefined }])[0].overrides).toEqual({}); // older saves
  });

  it("drops icons the library no longer has from every artboard, keeping their cells (2026-11-14)", () => {
    const a = { ...newArtboard(tpl, [], { now: "t", id: "a", placedIds: ["p1", "gone", "p2"] }), lockedIds: ["gone", "p1"], heroIconId: "gone" };
    const b = newArtboard(tpl, [a], { now: "t", id: "b", placedIds: ["p1"] });
    const next = artboardsWithout([a, b], new Set(["p1", "p2"]));
    expect(next[0].placedIds[0]).toBe("p1");
    expect(next[0].placedIds[1]).toMatch(/^~empty:/);
    expect(next[0].placedIds[2]).toBe("p2");
    expect(next[0]).toMatchObject({ lockedIds: ["p1"], heroIconId: null });
    expect(next[1]).toBe(b); // untouched artboards stay the same object
    expect(artboardsWithout([b], new Set(["p1"]))).toEqual([b]);
  });

  it("an icon the library does not have is never drawn as Unavailable", () => {
    const config = parseSheetConfig(DEFAULT_CONFIG);
    const doc = composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: ["gone"], svgTexts: {} });
    expect(doc.svg).not.toContain("Unavailable");
    expect(doc.brokenIds).toEqual([]);
  });

  it("a generated answer fills the artboard's metadata and its visible title; the subtitle is the default phrase (2026-11-14)", () => {
    const art = newArtboard(tpl, [], { now: "t", id: "a" });
    const metadata = acceptSheetMetadata({ title: "Domestic household routines and grocery shopping", description: "Domestic household routines and grocery shopping concepts today", tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "food", "home", "kitchen"] });
    const next = withSheetAnswer(art, { metadata, artboardTitle: "household and food icons" });
    expect(next).toMatchObject({ title: "household and food icons", subtitle: "Editable stroke width", metadata: { state: "accepted" } });
    expect(withSheetAnswer(art, { metadata, artboardTitle: "" }).title).toBe(art.title); // no Title-Artboard: the title stays
  });

  it("names artboards after the template with the next free number", () => {
    const a1 = newArtboard(tpl, [], { now: "t1", id: "a1" });
    expect(a1.name).toBe(`${tpl.name} — #1`);
    expect(artboardName(tpl, [a1])).toBe(`${tpl.name} — #2`);
    expect(a1).toMatchObject({ templateId: "tpl-1", title: "kept out", placedIds: [], metadata: null, exportedAt: null }); // the template's sample words
    expect(newArtboard(tpl, [], { now: "t", id: "a", placedIds: ["p1", "p2"] }).placedIds).toEqual(["p1", "p2"]);
  });

  it("draws with the template's look and its own words", () => {
    const a = { ...newArtboard(tpl, [], { now: "t1", id: "a1" }), title: "Food Icon Assets", subtitle: "Editable stroke" };
    const config = artboardConfig(tpl, a);
    expect(config.banner).toMatchObject({ title: "Food Icon Assets", subtitle: "Editable stroke", background: tpl.config.banner.background });
    expect(config.grid).toEqual(tpl.config.grid);
  });

  it("counts icons on artboards not exported yet as pending use", () => {
    const a = { ...newArtboard(tpl, [], { now: "t", id: "a" }), placedIds: ["p1", "~empty:0", "p2"] };
    const b = { ...newArtboard(tpl, [a], { now: "t", id: "b" }), placedIds: ["p1"] };
    const done = { ...newArtboard(tpl, [a, b], { now: "t", id: "c" }), placedIds: ["p2", "p3"], exportedAt: "2026-11-13", countedIds: ["p2"] };
    // p2 was counted when "c" was exported; p3 was added to it afterwards, so it is pending until the next export
    expect(Object.fromEntries(pendingUse([a, b, done]))).toEqual({ p1: 2, p2: 1, p3: 1 });
  });

  it("reads the saved list field by field and drops artboards of removed templates", () => {
    const a = newArtboard(tpl, [], { now: "t", id: "a" });
    expect(parseArtboards([a, { ...a }, { id: "x", templateId: "gone", name: "x" }, 5], new Set(["tpl-1"])).map((x) => x.id)).toEqual(["a"]);
    expect(parseArtboards("junk")).toEqual([]);
  });
});

const rows = () => all('[data-testid^="builder-artboard-art-"]').filter((el) => el.classList.contains("bld-artboard-row"));
const savedArtboards = () => JSON.parse(localStorage.getItem(BUILDER_ARTBOARDS_KEY) ?? "[]") as Array<{ id: string; name: string; title: string; placedIds: string[]; templateId: string; overrides: unknown }>;
const savedTemplates = () => JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.templates.v1") ?? "[]") as Array<{ id: string; name?: string }>;
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
  it("a new artboard starts with the template's sample words and ONE random library icon, the other cells empty (2026-11-14)", async () => {
    await openLibrary();
    const library = tiles().map((t) => t.dataset.assetId!);
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    expect(q("builder-artboards-hint")).not.toBeNull(); // nothing selected yet

    await click(`builder-template-add-artboard-${tpl.id}`);
    const [first] = savedArtboards();
    expect(rows()).toHaveLength(1);
    expect(q(`builder-artboard-${first.id}`)?.className).toContain("is-open");
    expect(realIcons(first.placedIds)).toHaveLength(1); // one icon…
    expect(first.placedIds[0]).toBe(realIcons(first.placedIds)[0]); // …in the first cell
    expect(library).toContain(first.placedIds[0]); // picked from the whole library
    expect(text("builder-cells")).toContain("1 of 32 cells");
    expect(first.title).not.toBe(""); // the template's sample words, not blank
    expect((q("builder-title") as HTMLInputElement).value).toBe(first.title);
    expect((q("builder-subtitle") as HTMLInputElement).value).not.toBe("");

    await typeIn("builder-title", "Food Icon Assets");
    await click("builder-stage-artboard-save"); // artboard edits are saved explicitly, like a template's (2026-11-14)
    await waitUntil(() => savedArtboards()[0].title === "Food Icon Assets", "artboard saved");
    expect(text(`builder-artboard-${first.id}`)).toContain("1/32 icons");

    await click(`builder-artboard-add-${tpl.id}`); // a second one: sample words again, not the first's title
    expect((q("builder-title") as HTMLInputElement).value).toBe(first.title);
    await clickWith(`builder-artboard-${first.id}`, {}); // back to the first: its own title returns
    expect((q("builder-title") as HTMLInputElement).value).toBe("Food Icon Assets");
    expect(savedArtboards()[1].title).toBe(first.title);
  });

  it("changes on an artboard are its own; the rest follows the template; ↺ Template restores inheritance (2026-11-14)", async () => {
    await openLibrary();
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    await click(`builder-template-add-artboard-${tpl.id}`);
    const [a1, a2] = savedArtboards();
    const sheet = () => JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.config.v1") ?? "{}");
    expect(q(`builder-artboard-reset-${a2.id}`)).toBeNull(); // nothing of its own yet
    if (q("builder-padding") === null) await act(async () => { q("builder-section-artboard")!.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await typeIn("builder-padding", "50"); // a2 is open: its own padding
    await click("builder-stage-artboard-save");
    await waitUntil(() => JSON.stringify(savedArtboards()[1].overrides) === JSON.stringify({ artboard: { padding: 50 } }), "a2 keeps its own padding");
    expect(savedArtboards()[0].overrides).toEqual({});
    expect(q(`builder-artboard-reset-${a2.id}`)).not.toBeNull();
    expect(q(`builder-artboard-reset-${a1.id}`)).toBeNull();

    await click(`builder-template-open-${tpl.id}`); // edit the template: padding and columns
    await typeIn("builder-padding", "20");
    await click("builder-columns-inc");
    const columns = sheet().grid.columns;
    await click("builder-stage-template-save");

    await clickWith(`builder-artboard-${a2.id}`, {});
    expect(sheet().artboard.padding).toBe(50); // its own change stays
    expect(sheet().grid.columns).toBe(columns); // never changed on it: follows the template
    await clickWith(`builder-artboard-${a1.id}`, {});
    expect(sheet().artboard.padding).toBe(20); // a1 follows the template in everything
    expect(sheet().grid.columns).toBe(columns);

    await clickWith(`builder-artboard-${a2.id}`, {});
    await click(`builder-artboard-reset-${a2.id}`);
    expect(sheet().artboard.padding).toBe(20);
    await waitUntil(() => JSON.stringify(savedArtboards()[1].overrides) === "{}", "a2 inherits everything again");
    expect(q(`builder-artboard-reset-${a2.id}`)).toBeNull();
  });

  it("the stage says what is being edited; Edit main template and double-clicks switch between the artboard and its template (2026-11-14)", async () => {
    await openLibrary();
    expect(q("builder-editing")).toBeNull(); // a free sheet: nothing to name
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    const [art] = savedArtboards();
    expect(q("builder-editing")?.dataset.kind).toBe("artboard");
    expect(text("builder-editing")).toContain(art.name);
    expect(text("builder-editing")).toContain(tpl.name ?? "");

    await click("builder-edit-main-template"); // switch to the template
    expect(q("builder-editing")?.dataset.kind).toBe("template");
    expect(q(`builder-template-${tpl.id}`)?.className).toContain("is-editing");
    expect(q(`builder-artboard-${art.id}`)?.className).not.toContain("is-open");
    expect(q(`builder-artboard-${art.id}`)?.className).not.toContain("is-active"); // no row looks edited now
    expect(q("builder-edit-main-template")).toBeNull();

    const row = q(`builder-artboard-${art.id}`)!;
    await act(async () => { row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
    await settle(0);
    expect(q("builder-editing")?.dataset.kind).toBe("artboard");
    expect(row.className).toContain("is-open");

    const pic = q(`builder-template-open-${tpl.id}`)!;
    await act(async () => { pic.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
    await settle(0);
    expect(q("builder-editing")?.dataset.kind).toBe("template");
  });

  it("leaving a changed artboard asks Save / Discard / Cancel, like a template; Reset and Save sit on the stage (2026-11-14)", async () => {
    await openLibrary();
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    await click(`builder-template-add-artboard-${tpl.id}`);
    const [a1, a2] = savedArtboards();
    const dbl = async (id: string) => { const el = q(id)!; await act(async () => { el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); }); await settle(0); };
    const title = () => (q("builder-title") as HTMLInputElement).value;
    expect(q("builder-stage-artboard-save")).toBeNull(); // nothing changed yet
    await dbl(`builder-artboard-${a1.id}`); // unchanged: no question
    expect(q("builder-leave-dialog")).toBeNull();
    await dbl(`builder-artboard-${a2.id}`);

    await typeIn("builder-title", "Draft");
    expect(q("builder-stage-artboard-save")).not.toBeNull();
    expect(savedArtboards()[1].title).toBe(a2.title); // not saved by itself any more
    await dbl(`builder-artboard-${a1.id}`);
    expect(q("builder-leave-dialog")).not.toBeNull();
    expect(text("builder-leave-dialog")).toContain(a2.name);
    await click("builder-leave-cancel");
    expect(title()).toBe("Draft");

    await dbl(`builder-artboard-${a1.id}`);
    await click("builder-leave-discard");
    expect(q(`builder-artboard-${a1.id}`)?.className).toContain("is-open");
    expect(savedArtboards()[1].title).toBe(a2.title);
    await dbl(`builder-artboard-${a2.id}`);
    expect(title()).toBe(a2.title); // the draft was discarded

    await typeIn("builder-title", "Saved once");
    await click("builder-stage-artboard-save");
    expect(q("builder-stage-artboard-save")).toBeNull();
    await typeIn("builder-title", "Changed after saving"); // tracked again after a save (2026-11-15)
    expect(q("builder-stage-artboard-save")).not.toBeNull();
    await typeIn("builder-title", "Kept");
    await click(`builder-template-open-${tpl.id}`); // leaving for the template asks too
    await click("builder-leave-save");
    expect(savedArtboards()[1].title).toBe("Kept");
    expect(q("builder-editing")?.dataset.kind).toBe("template");

    await dbl(`builder-artboard-${a1.id}`);
    await typeIn("builder-title", "Oops");
    await click("builder-stage-artboard-reset");
    expect(title()).toBe(a1.title);
    expect(q("builder-stage-artboard-save")).toBeNull();
  });

  it("Export all selected writes each checked artboard under _artboard_sheets/<month>/<day>/<sheet>/artboard_variant_N/export (2026-11-14)", async () => {
    await openLibrary();
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    await click(`builder-template-add-artboard-${tpl.id}`);
    const [a1, a2] = savedArtboards();
    expect(q("builder-export-selected")?.textContent).toContain("(1)"); // nothing checked: the open artboard
    await clickWith(`builder-artboard-check-${a1.id}`, {});
    await clickWith(`builder-artboard-check-${a2.id}`, {});
    await click("builder-export-selected");
    const dir = (node: FakeDir | undefined, name: string) => node?.children.get(name) as FakeDir | undefined;
    await waitUntil(() => savedArtboards().every((a) => typeof (a as { folder?: string | null }).folder === "string"), "both exported");
    const f1 = (savedArtboards()[0] as unknown as { folder: string }).folder;
    const f2 = (savedArtboards()[1] as unknown as { folder: string }).folder;
    expect(f1).toMatch(/^_artboard_sheets\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+_sheet_\d+_icons_[a-z_]+_palette_id\d{5}\/artboard_variant_1$/);
    expect(f2).toBe(f1.replace(/artboard_variant_1$/, "artboard_variant_2")); // one template = one sheet folder
    let node: FakeDir | undefined = scanned;
    for (const part of `${f1}/export`.split("/")) node = dir(node, part);
    const names = [...(node?.children.keys() ?? [])];
    expect(names).toContain("export.json");
    expect(names.some((n) => n.endsWith("_v1.svg"))).toBe(true);
    const record = JSON.parse((node!.children.get("export.json") as FakeFile).text);
    expect(record.outputs.svg.path).toMatch(/_v1\.svg$/);
    expect(text("builder-toast")).toMatch(/exported/i); // canvas-only parts (JPG / PNG) and the EPS report their problem here
  });

  it("clicking a row shows its metadata in the upload tab's editor; edits and Accept save into that artboard; each row can regenerate (2026-11-15)", async () => {
    await openLibrary();
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    await click(`builder-template-add-artboard-${tpl.id}`);
    const [a1, a2] = savedArtboards();
    expect(q(`builder-artboard-regen-${a1.id}`)).not.toBeNull(); // every row
    expect(q(`builder-artboard-regen-${a2.id}`)).not.toBeNull();
    const stored = JSON.parse(localStorage.getItem(BUILDER_ARTBOARDS_KEY) ?? "[]");
    stored[0].metadata = { title: "Short", description: "Too short", tags: ["icon"], state: "draft" };
    localStorage.setItem(BUILDER_ARTBOARDS_KEY, JSON.stringify(stored));
    act(() => ui.unmount()); // reload with that metadata
    ui = createRoot(host);
    act(() => { ui.render(<Workbench />); });
    await openLibrary();
    await clickWith(`builder-artboard-${a1.id}`, {});
    expect(q(`upload-meta-fields-${a1.id}`)).not.toBeNull(); // the active row's editor
    expect(q(`upload-meta-name-${a1.id}`)).toBeNull();
    expect(q(`upload-meta-fields-${a2.id}`)).toBeNull();
    expect((q(`upload-meta-title-${a1.id}`) as HTMLInputElement).value).toBe("Short");
    const type = async (id: string, value: string) => {
      const el = q(id) as HTMLInputElement | HTMLTextAreaElement;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
    };
    await type(`upload-meta-title-${a1.id}`, "Domestic household routines and grocery shopping");
    await type(`upload-meta-description-${a1.id}`, "Domestic household routines and grocery shopping concepts today");
    await type(`upload-meta-tags-${a1.id}`, "icon, pictogram, vector, stroke, line, editable, web, food, home, kitchen");
    await click(`upload-meta-accept-${a1.id}`);
    const saved = JSON.parse(localStorage.getItem(BUILDER_ARTBOARDS_KEY) ?? "[]")[0].metadata;
    expect(saved).toMatchObject({ state: "accepted", title: "Domestic household routines and grocery shopping" });
    expect(q("builder-stage-artboard-save")).toBeNull(); // the open artboard shows no unsaved change
    await click(`builder-artboard-regen-${a2.id}`);
    expect(text("builder-toast")).toMatch(/Gemini API key/); // the one-artboard request (asks for the key first)
  });

  it("the pinned header has ✦ Generate metadata beside Export all selected: checked artboards, else the open one (2026-11-15)", async () => {
    await openLibrary();
    expect(q("builder-header-generate-metadata")?.textContent).toContain("Generate metadata"); // a free sheet: the sheet itself
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    await click(`builder-template-add-artboard-${tpl.id}`);
    const [a1, a2] = savedArtboards();
    expect(q("builder-header-generate-metadata")?.textContent).toContain("(1)"); // the open artboard
    await clickWith(`builder-artboard-check-${a1.id}`, {});
    await clickWith(`builder-artboard-check-${a2.id}`, {});
    expect(q("builder-header-generate-metadata")?.textContent).toContain("(2)");
    expect(q("builder-header")!.contains(q("builder-export-selected"))).toBe(true);
    await click("builder-header-generate-metadata");
    expect(text("builder-toast")).toMatch(/Gemini API key/); // the same exact-request path (asks for the key first)
  });

  it("the stage's right strip lists the template's artboards: click switches to one, the open one is marked; ＋ Artboard beside the label (2026-11-16)", async () => {
    await openLibrary();
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    expect(q("builder-artboard-strip")).toBeNull(); // no artboards yet
    await click("builder-editing-add-artboard"); // ＋ Artboard beside "Editing template"
    expect(savedArtboards()).toHaveLength(1);
    for (let i = 0; i < 5; i++) await click("builder-editing-add-artboard");
    const arts = savedArtboards();
    expect(arts).toHaveLength(6);
    expect(q("builder-artboard-strip")).not.toBeNull();
    expect(host.querySelectorAll('[data-testid^="builder-strip-art-"]')).toHaveLength(6);
    expect(q(`builder-strip-${arts[5].id}`)?.getAttribute("aria-current")).toBe("true"); // the open one is marked
    await click(`builder-strip-${arts[1].id}`); // switch at once
    expect(q("builder-editing")?.textContent).toContain(arts[1].name);
    expect(q(`builder-strip-${arts[1].id}`)?.getAttribute("aria-current")).toBe("true");
    expect(q(`builder-strip-${arts[5].id}`)?.getAttribute("aria-current")).toBe("false");
    expect(q("builder-strip-up")).not.toBeNull(); // more than four: arrows (the wheel scrolls too)
    expect(q("builder-strip-down")).not.toBeNull();
    expect(tpl.id).toBe(arts[1].templateId);
  });

  it("✕ Remove artboard beside ＋ Artboard; adding and removing are undo steps (2026-11-16)", async () => {
    await openLibrary();
    await click("builder-template-save");
    expect(q("builder-editing-remove-artboard")).toBeNull(); // only while an artboard is open
    await click("builder-editing-add-artboard");
    await click("builder-editing-add-artboard");
    const [a1, a2] = savedArtboards();
    expect(savedArtboards()).toHaveLength(2);
    await click("builder-editing-remove-artboard"); // the open one (a2)
    expect(savedArtboards().map((a) => a.id)).toEqual([a1.id]);
    expect(q("builder-editing")?.textContent).toContain(a1.name); // the stage moves to a1 — no dead view
    await click("builder-undo"); // the removal comes back, whole
    await waitUntil(() => savedArtboards().length === 2, "removal undone");
    expect(savedArtboards()[1]).toMatchObject({ id: a2.id, name: a2.name });
    await click("builder-redo");
    await waitUntil(() => savedArtboards().length === 1, "removal redone");
    await click("builder-undo");
    await waitUntil(() => savedArtboards().length === 2, "back again");
    await click("builder-undo"); // the second add, undone
    await waitUntil(() => savedArtboards().length === 1, "add undone");
    expect(savedArtboards()[0].id).toBe(a1.id);
  });

  it("undoing a new artboard shows the artboard viewed before it — never a dead stage (2026-11-16)", async () => {
    await openLibrary();
    await click("builder-template-save");
    await click("builder-editing-add-artboard");
    await click("builder-editing-add-artboard");
    const [a1, a2] = savedArtboards();
    await clickWith(`builder-artboard-${a1.id}`, {}); // viewing a1
    await typeIn("builder-title", "First one");
    await click("builder-stage-artboard-save");
    await click("builder-editing-add-artboard"); // a3, open
    expect(savedArtboards()).toHaveLength(3);
    await click("builder-undo"); // a3 is gone…
    await waitUntil(() => savedArtboards().length === 2, "add undone");
    expect(q("builder-editing")?.textContent).toContain(a1.name); // …and the stage shows a1 again, not a3
    expect((q("builder-title") as HTMLInputElement).value).toBe("First one");
    expect(q(`builder-artboard-${a1.id}`)?.className).toContain("is-open");
    expect(a2.id).not.toBe(a1.id);
  });

  it("after a reload the open artboard is still open and selected, so edits keep saving into it (2026-11-14)", async () => {
    await openLibrary();
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    await click(`builder-template-add-artboard-${tpl.id}`);
    const second = savedArtboards()[1];
    await typeIn("builder-title", "Before reload");
    await click("builder-stage-artboard-save");
    await waitUntil(() => savedArtboards()[1].title === "Before reload", "saved");
    await settle(50); // the session autosave

    act(() => ui.unmount()); // reload: a fresh app on the same saved state
    ui = createRoot(host);
    act(() => { ui.render(<Workbench />); });
    await click("tab-svg-builder");
    expect(q(`builder-artboard-${second.id}`)?.className).toContain("is-open");
    expect(q(`builder-artboard-${second.id}`)?.className).toContain("is-active");
    expect(q(`builder-template-${tpl.id}`)?.className).toContain("is-active"); // its template is selected above
    await typeIn("builder-title", "After reload");
    await click("builder-stage-artboard-save");
    await waitUntil(() => savedArtboards()[1].title === "After reload", "edit after reload saved into the same artboard");
    expect(savedArtboards()[0].title).not.toBe("After reload");
  });

  it("checked templates show their artboards together; rows check with the RULE 25 gestures; bulk remove", async () => {
    await openLibrary();
    await click("builder-template-save");
    await click("builder-template-save-new"); // a second template (Save would write into the one being edited)
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

  it("an export saves each icon's use once per artboard, beside its SVG; icons not exported yet show as pending", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }));
    await openLibrary();
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    await click("builder-clear"); // a new artboard starts filled: empty it to place one icon
    const tile = tiles()[0];
    const id = tile.dataset.assetId!;
    await act(async () => { tile.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle(0);
    await waitUntil(() => text(`builder-used-${id}`).includes("+1"), "pending use shown");
    expect(text(`builder-used-${id}`)).toBe("×0 +1");

    await click("builder-export-toggle");
    await click("builder-export-svg");
    await waitUntil(() => text(`builder-used-${id}`) === "×1", "saved use shown");
    const usageFile = () => ["food icons", "interface"]
      .flatMap((dir) => [...((scanned.children.get(dir) as FakeDir | undefined)?.children.values() ?? [])])
      .find((f) => f.name.endsWith(".usage.json")) as FakeFile | undefined;
    expect(usageFile()).toBeDefined();
    expect(JSON.parse(usageFile()!.text)).toMatchObject({ id, used: 1 });
    expect(savedArtboards()[0]).toMatchObject({ countedIds: [id] });

    await click("builder-export-toggle");
    await click("builder-export-svg"); // the same artboard again: not counted twice
    await settle(0);
    expect(JSON.parse(usageFile()!.text).used).toBe(1);
  });

  it("every library tile and every icon on the artboard shows how often it was used; # Used switches the artboard index", async () => {
    await openLibrary();
    expect(tiles().every((el) => q(`builder-used-${el.dataset.assetId}`)?.textContent === "×0")).toBe(true); // shown even when never used
    expect(q("builder-cell-use-0")?.textContent).toBe("×0"); // the auto-placed sheet: plain sheet, nothing pending
    await click("builder-template-save");
    const [tpl] = savedTemplates();
    await click(`builder-template-add-artboard-${tpl.id}`);
    await click("builder-clear"); // the new artboard's random start icon could be this very tile
    await act(async () => { tiles()[0].dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle(0);
    await waitUntil(() => q("builder-cell-use-0")?.textContent === "×0+1", "artboard index shows pending use");

    expect(q("builder-toggle-usage")?.getAttribute("aria-pressed")).toBe("true");
    await click("builder-toggle-usage");
    expect(q("builder-cell-use-0")).toBeNull();
    expect(JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.prefs.v1") ?? "{}").showUsage).toBe(false);
    await click("builder-toggle-usage");
    expect(q("builder-cell-use-0")).not.toBeNull();
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
