// @vitest-environment happy-dom
// svg_builder_remove.test.tsx — removing templates and artboards (2026-11-22):
// at once, as ONE undo step. A removed template takes its artboards AND its
// folder under _artboard_sheets — template.json and every artboard folder
// inside, exports included — into `_artboard_sheets/.removed versions`; a
// removed artboard's folder goes there too. Undo moves the folders back and
// restores the lists; Redo removes them again.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { BUILDER_ARTBOARDS_KEY } from "../src/svgBuilder/artboardstore";
import { BUILDER_TEMPLATES_KEY } from "../src/svgBuilder/templatestore";
import { setIndexRuntime } from "../src/svgBuilder/indexer/runtime";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, saveHandles: vi.fn(async () => undefined), loadHandles: vi.fn(async () => null) };
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
const STEMS = ["apple", "bread", "cake", "donut", "egg", "home", "gear", "bell", "user", "mail", "lock", "star"];
const TRASH = "_artboard_sheets/.removed versions";

function addPair(root: FakeDir, dir: string, stem: string): void {
  let node = root;
  for (const part of dir.split("/")) {
    const next = node.children.get(part);
    if (next instanceof FakeDir) { node = next; continue; }
    const made = new FakeDir(part); node.children.set(part, made); node = made;
  }
  const meta = serializePairMeta(pairFile(dir, `${stem}_AI.png`, { versions: [svgVersion(`${dir}/${stem}_AI.svg`, { version: 1, review: "approved" })] }));
  node.children.set(`${stem}_AI.png`, new FakeFile(`${stem}_AI.png`, 20, 3100, "ai"));
  node.children.set(`${stem}_AI.svg`, new FakeFile(`${stem}_AI.svg`, SVG.length, 3400, SVG));
  node.children.set(`${stem}_AI.svg.json`, new FakeFile(`${stem}_AI.svg.json`, meta.length, 3500, meta));
}

let host: HTMLDivElement;
let scanned: FakeDir;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = (id: string) => q(id)?.textContent ?? "";
async function clickWith(id: string, init: MouseEventInit = {}): Promise<void> {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init })); });
  await settle(0);
}
const click = (id: string) => clickWith(id);

interface Saved { id: string; name: string; templateId?: string; folder?: string | null }
const savedTemplates = () => JSON.parse(localStorage.getItem(BUILDER_TEMPLATES_KEY) ?? "[]") as Saved[];
const savedArtboards = () => JSON.parse(localStorage.getItem(BUILDER_ARTBOARDS_KEY) ?? "[]") as Saved[];
const dirAt = (path: string) => path.split("/").reduce<FakeDir | undefined>((d, part) => d?.children.get(part) as FakeDir | undefined, scanned);
const folderOf = (list: Saved[], id: string) => list.find((x) => x.id === id)?.folder ?? null;
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const trashed = () => [...(dirAt(TRASH)?.children.keys() ?? [])];

async function openLibrary(): Promise<void> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => text("builder-library-count") === "12", "library scanned");
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
}

/** ＋ Save template (or Save as new): the newest template, once its folder is on disk. */
async function saveTemplate(asNew = false): Promise<Saved & { folder: string }> {
  const before = savedTemplates().length;
  await click(asNew ? "builder-template-save-new" : "builder-template-save");
  await waitUntil(() => savedTemplates().length === before + 1, "template saved");
  const id = savedTemplates()[before].id;
  await waitUntil(() => typeof folderOf(savedTemplates(), id) === "string" && dirAt(folderOf(savedTemplates(), id)!) !== undefined, "template folder made");
  return { ...savedTemplates()[before], folder: folderOf(savedTemplates(), id)! };
}

/** ＋ Artboard on a template: the new artboard, once its folder (inside the template's) is on disk. */
async function addArtboard(templateId: string): Promise<Saved & { folder: string }> {
  const before = savedArtboards().length;
  await click(`builder-template-add-artboard-${templateId}`);
  await waitUntil(() => savedArtboards().length === before + 1, "artboard added");
  const id = savedArtboards()[before].id;
  await waitUntil(() => typeof folderOf(savedArtboards(), id) === "string" && dirAt(folderOf(savedArtboards(), id)!) !== undefined, "artboard folder made");
  return { ...savedArtboards()[before], folder: folderOf(savedArtboards(), id)! };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  resetAppStore();
  const dir = new FakeDir("icons");
  STEMS.forEach((s, i) => addPair(dir, i < 5 ? "food icons" : "interface", s));
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

describe("removing a template — at once, with its artboards and folder, one undo step (2026-11-22)", () => {
  it("✕ moves the template's folder (template.json + its artboard folders) into .removed versions; Undo brings everything back; Redo removes it again", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    const t2 = await saveTemplate(true);
    const a1 = await addArtboard(t1.id);
    const a2 = await addArtboard(t1.id);
    const a3 = await addArtboard(t2.id);
    expect(a1.folder.startsWith(`${t1.folder}/`) && a2.folder.startsWith(`${t1.folder}/`)).toBe(true); // artboards live inside it
    const before = { templates: savedTemplates(), artboards: savedArtboards() };

    await click(`builder-template-remove-${t1.id}`);
    await waitUntil(() => dirAt(t1.folder) === undefined, "template folder moved away");
    expect(q("builder-remove-dialog")).toBeNull(); // no question: Undo is the way back
    expect(savedTemplates().map((t) => t.id)).toEqual([t2.id]);
    expect(savedArtboards().map((a) => a.id)).toEqual([a3.id]);
    expect(q(`builder-template-${t1.id}`)).toBeNull();
    expect(trashed()).toHaveLength(1);
    expect(trashed()[0].startsWith(`${nameOf(t1.folder)}~`)).toBe(true);
    const bin = dirAt(`${TRASH}/${trashed()[0]}`);
    expect(bin?.children.has("template.json")).toBe(true);
    expect(dirAt(`${TRASH}/${trashed()[0]}/${nameOf(a1.folder)}`)?.children.has("metadata.json")).toBe(true);
    expect(dirAt(t2.folder)?.children.has("template.json")).toBe(true); // the other template is untouched
    expect(dirAt(a3.folder)).toBeDefined();
    expect(text("builder-toast")).toMatch(/Undo brings/);

    await click("builder-undo"); // ONE step brings it back whole
    await waitUntil(() => dirAt(t1.folder) !== undefined && savedTemplates().length === 2, "template and folder back");
    expect(savedTemplates().map((t) => [t.id, t.name, t.folder])).toEqual(before.templates.map((t) => [t.id, t.name, t.folder]));
    expect(savedArtboards().map((a) => [a.id, a.folder])).toEqual(before.artboards.map((a) => [a.id, a.folder]));
    expect(dirAt(t1.folder)?.children.has("template.json")).toBe(true);
    expect(dirAt(a2.folder)?.children.has("metadata.json")).toBe(true);
    expect(trashed()).toEqual([]); // the trash empties as things come back

    await click("builder-redo");
    await waitUntil(() => dirAt(t1.folder) === undefined && savedTemplates().length === 1, "removed again");
    expect(savedArtboards().map((a) => a.id)).toEqual([a3.id]);
    expect(trashed()).toHaveLength(1);
  });

  it("removing the template on the stage moves the stage to the template left — and ONE Undo brings the removed one back", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    const t2 = await saveTemplate(true); // t2 is the one being edited
    expect(text("builder-template-editing")).toContain(t2.name);
    await click(`builder-template-remove-${t2.id}`);
    await waitUntil(() => dirAt(t2.folder) === undefined, "folder moved away");
    expect(text("builder-template-editing")).toContain(t1.name);
    await click("builder-undo");
    await waitUntil(() => savedTemplates().length === 2, "one Undo restores it");
    expect(dirAt(t2.folder)?.children.has("template.json")).toBe(true);
  });

  it("the date folders a removal empties are cleared (never _artboard_sheets); Undo makes them again", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    await addArtboard(t1.id);
    const month = t1.folder.split("/").slice(0, 2).join("/");
    await click(`builder-template-remove-${t1.id}`);
    await waitUntil(() => dirAt(month) === undefined, "empty month folder removed");
    expect([...(dirAt("_artboard_sheets")?.children.keys() ?? [])]).toEqual([".removed versions"]);
    expect(savedTemplates()).toEqual([]);
    expect(savedArtboards()).toEqual([]);
    await click("builder-undo");
    await waitUntil(() => dirAt(t1.folder)?.children.has("template.json") === true, "folder back where it was");
    expect(dirAt(TRASH)).toBeUndefined(); // an empty trash goes too
  });

  it("undoing a removal touches only what it removed: a template saved after it keeps its new look", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    const t2 = await saveTemplate(true); // t2 is being edited
    await click(`builder-template-remove-${t1.id}`);
    await waitUntil(() => dirAt(t1.folder) === undefined, "removed");
    await click("builder-rows-dec"); // an edit of t2 on the stage (one config step)…
    await click("builder-template-save"); // …saved into t2
    const rowsOf = (id: string) => (savedTemplates().find((t) => t.id === id) as unknown as { config: { grid: { rows: number } } } | undefined)?.config.grid.rows;
    expect(rowsOf(t2.id)).toBe(3);
    await click("builder-undo"); // the stage edit
    await click("builder-undo"); // the removal
    await waitUntil(() => savedTemplates().length === 2 && dirAt(t1.folder) !== undefined, "removal undone");
    expect(rowsOf(t2.id)).toBe(3); // never the whole list as it was at the removal
    expect(savedTemplates().map((t) => t.id)).toEqual([t1.id, t2.id]); // back at its place
  });

  it("a removed template's artboards leave the checks: the header no longer counts them", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    await saveTemplate(true);
    const a1 = await addArtboard(t1.id);
    await clickWith(`builder-artboard-check-${a1.id}`);
    expect(text("builder-export-selected")).toContain("(1)");
    await click(`builder-template-remove-${t1.id}`);
    await waitUntil(() => dirAt(t1.folder) === undefined, "removed");
    expect(text("builder-export-selected")).not.toMatch(/\(\d+\)/);
  });
});

describe("removing artboards — their folders go into .removed versions too, one undo step (2026-11-22)", () => {
  it("bulk ✕ Remove moves each checked artboard's folder; the template folder stays; Undo brings them back", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    const a1 = await addArtboard(t1.id);
    const a2 = await addArtboard(t1.id);
    const a3 = await addArtboard(t1.id);
    await clickWith(`builder-artboard-check-${a1.id}`);
    await clickWith(`builder-artboard-check-${a2.id}`);
    await click("builder-artboards-remove");
    await waitUntil(() => dirAt(a1.folder) === undefined && dirAt(a2.folder) === undefined, "artboard folders moved away");
    expect(savedArtboards().map((a) => a.id)).toEqual([a3.id]);
    expect(trashed()).toHaveLength(2);
    expect(dirAt(t1.folder)?.children.has("template.json")).toBe(true);
    expect(dirAt(a3.folder)).toBeDefined();
    await click("builder-undo");
    await waitUntil(() => dirAt(a1.folder) !== undefined && dirAt(a2.folder) !== undefined, "both back");
    expect(savedArtboards().map((a) => a.id)).toEqual([a1.id, a2.id, a3.id]);
    expect(trashed()).toEqual([]);
  });
});
