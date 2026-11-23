// @vitest-environment happy-dom
// svg_builder_register_sync.test.tsx — the builder's JSON files edited OUTSIDE the
// app (2026-11-22). 🗂 Register reads back an edited template.json / sheet.json /
// metadata.json into its template or artboard (and the stage follows); the app's
// own copies — older ones, the open artboard's live draft — are never read back,
// because every file the app writes carries its fingerprint. The app keeps the
// artboards' files current (a template save rewrites them), never writes over an
// outside edit, and replaces a differing file from before this version only
// after keeping a copy in `.removed versions`.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { BUILDER_ARTBOARDS_KEY } from "../src/svgBuilder/artboardstore";
import { BUILDER_TEMPLATES_KEY } from "../src/svgBuilder/templatestore";
import { FILE_SIGS_KEY, resetFileSigs } from "../src/svgBuilder/filesigstore";
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
async function click(id: string): Promise<void> {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
}
async function typeIn(id: string, value: string): Promise<void> {
  const input = q(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); input.blur(); });
  await settle(0);
}

interface Saved { id: string; name: string; title?: string; templateId?: string; folder?: string | null; placedIds?: string[]; overrides?: unknown;
  metadata?: { title: string; state: string } | null; config?: { banner: { background: string }; grid: { columns: number } } }
const savedTemplates = () => JSON.parse(localStorage.getItem(BUILDER_TEMPLATES_KEY) ?? "[]") as Saved[];
const savedArtboards = () => JSON.parse(localStorage.getItem(BUILDER_ARTBOARDS_KEY) ?? "[]") as Saved[];
const stageConfig = () => JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.config.v1") ?? "{}") as { banner: { background: string; title: string } };
const dirAt = (path: string) => path.split("/").reduce<FakeDir | undefined>((d, part) => d?.children.get(part) as FakeDir | undefined, scanned);
const fileAt = (path: string) => dirAt(path.slice(0, path.lastIndexOf("/")))?.children.get(path.slice(path.lastIndexOf("/") + 1)) as FakeFile | undefined;
const jsonAt = (path: string) => JSON.parse(fileAt(path)?.text ?? "null") as Record<string, any> | null;
const realIcons = (ids: string[] = []) => ids.filter((id) => !id.startsWith("~empty:"));

/** A person (or an AI) edits a JSON file in Explorer. */
function editJson(path: string, edit: (raw: Record<string, any>) => void): void {
  const file = fileAt(path);
  if (file === undefined) throw new Error(`no file ${path}`);
  const raw = JSON.parse(file.text) as Record<string, any>;
  edit(raw);
  file.data = null;
  file.text = `${JSON.stringify(raw, null, 2)}\n`;
  file.size = file.text.length;
  file.mtime = Date.now() + 60_000;
}

async function openLibrary(): Promise<void> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => text("builder-library-count") === "12", "library scanned");
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
}

async function saveTemplate(): Promise<Saved & { folder: string }> {
  const before = savedTemplates().length;
  await click("builder-template-save");
  await waitUntil(() => savedTemplates().length === before + 1 && typeof savedTemplates()[before].folder === "string", "template saved with its folder");
  const t = savedTemplates()[before] as Saved & { folder: string };
  await waitUntil(() => fileAt(`${t.folder}/template.json`) !== undefined, "template.json written");
  return t;
}

async function addArtboard(templateId: string): Promise<Saved & { folder: string }> {
  const before = savedArtboards().length;
  await click(`builder-template-add-artboard-${templateId}`);
  await waitUntil(() => savedArtboards().length === before + 1 && typeof savedArtboards()[before].folder === "string", "artboard added with its folder");
  const a = savedArtboards()[before] as Saved & { folder: string };
  await waitUntil(() => fileAt(`${a.folder}/sheet.json`) !== undefined && fileAt(`${a.folder}/metadata.json`) !== undefined, "artboard files written");
  return a;
}

const register = async () => { await click("builder-register"); await settle(1000); };

function mount(): void {
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  resetFileSigs();
  resetAppStore();
  const dir = new FakeDir("icons");
  STEMS.forEach((s, i) => addPair(dir, i < 5 ? "food icons" : "interface", s));
  scanned = dir;
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => dir;
  host = document.createElement("div");
  document.body.appendChild(host);
  mount();
});

afterEach(() => {
  setIndexRuntime(null);
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.unstubAllGlobals();
});

describe("🗂 Register reads back files edited outside the app (2026-11-22)", () => {
  it("an edited template.json updates the template — the template on the stage follows — and a second Register finds nothing new", async () => {
    await openLibrary();
    const t1 = await saveTemplate(); // being edited, nothing unsaved
    editJson(`${t1.folder}/template.json`, (raw) => { raw.config.banner.background = "#FF0000"; raw.config.grid.columns = 6; });
    await register();
    await waitUntil(() => savedTemplates()[0].config?.banner.background === "#FF0000", "template updated from its file");
    expect(savedTemplates()[0].config?.grid.columns).toBe(6);
    expect(savedTemplates()[0].name).toBe(t1.name);
    expect(stageConfig().banner.background).toBe("#FF0000"); // the stage shows the file's look
    expect(text("builder-toast")).toMatch(/updated 1 template/);
    await register();
    expect(text("builder-toast")).toMatch(/Nothing new or changed/);
  });

  it("an edited sheet.json and metadata.json update their artboard — the open artboard on the stage follows", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    const names = (jsonAt(`${t1.folder}/template.json`)!.icons as Array<{ name: string; id: string } | null>).filter((x): x is { name: string; id: string } => x !== null);
    const a1 = await addArtboard(t1.id); // open on the stage
    const [x, y] = names.filter((n) => !realIcons(a1.placedIds).includes(n.id));
    editJson(`${a1.folder}/sheet.json`, (raw) => { raw.config.banner.title = "Dining"; raw.icons = [x.name, null, y.name]; });
    editJson(`${a1.folder}/metadata.json`, (raw) => { raw.title = "Dining icons for menus"; raw.description = "Outline dining icons"; raw.tags = ["dining"]; });
    await register();
    await waitUntil(() => savedArtboards()[0].title === "Dining", "artboard updated from its files");
    expect(realIcons(savedArtboards()[0].placedIds)).toEqual([x.id, y.id]);
    expect(savedArtboards()[0].metadata).toMatchObject({ title: "Dining icons for menus", state: "draft" });
    expect((q("builder-title") as HTMLInputElement).value).toBe("Dining"); // the stage follows
    expect(text("builder-toast")).toMatch(/updated 0 template\(s\) and 1 artboard/);
  });

  it("a template save rewrites its artboards' sheet.json, so Register then pins nothing on them", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    const a1 = await addArtboard(t1.id);
    await addArtboard(t1.id); // a1 is no longer open
    const columns = jsonAt(`${a1.folder}/sheet.json`)!.config.grid.columns as number;
    await click(`builder-template-${t1.id}`); // open the template's design
    await click("builder-columns-inc");
    await click("builder-template-save");
    await waitUntil(() => jsonAt(`${a1.folder}/sheet.json`)!.config.grid.columns === columns + 1, "a1's sheet.json follows its template");
    await register();
    expect(savedArtboards().find((a) => a.id === a1.id)?.overrides).toEqual({});
    expect(text("builder-toast")).toMatch(/Nothing new or changed/);
  });

  it("the open artboard's unsaved draft (live in its sheet.json) is never read back as an edit", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    const a1 = await addArtboard(t1.id);
    await typeIn("builder-title", "Draft words");
    await waitUntil(() => jsonAt(`${a1.folder}/sheet.json`)!.config.banner.title === "Draft words", "the draft is live in sheet.json");
    await register();
    expect(savedArtboards()[0].title).toBe(a1.title); // not saved by Register
    expect(text("builder-toast")).toMatch(/Nothing new or changed/);
  });

  it("the stage never writes over a sheet.json changed outside the app; Register reads it and the stage keeps its unsaved edits", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    const a1 = await addArtboard(t1.id);
    editJson(`${a1.folder}/sheet.json`, (raw) => { raw.config.banner.title = "Outside words"; });
    await typeIn("builder-title", "Stage words");
    await settle(1500);
    expect(jsonAt(`${a1.folder}/sheet.json`)!.config.banner.title).toBe("Outside words");
    expect(text("builder-toast")).toMatch(/changed outside the app/);
    await register();
    await waitUntil(() => savedArtboards()[0].title === "Outside words", "the outside edit is read");
    expect((q("builder-title") as HTMLInputElement).value).toBe("Stage words");
    expect(text("builder-toast")).toMatch(/keeps your unsaved edits/);
  });

  it("artboard files from before this version are replaced from the app once — the old copy waits in .removed versions", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    const a1 = await addArtboard(t1.id);
    await addArtboard(t1.id); // a1 closed
    act(() => ui.unmount());
    editJson(`${a1.folder}/sheet.json`, (raw) => { raw.config.banner.title = "Hand edit before the update"; });
    localStorage.removeItem(FILE_SIGS_KEY); // as before fingerprints existed
    resetFileSigs();
    mount();
    await openLibrary();
    await waitUntil(() => dirAt(`${a1.folder}/.removed versions`) !== undefined, "old copy kept");
    const kept = [...dirAt(`${a1.folder}/.removed versions`)!.children.values()] as FakeFile[];
    expect(kept).toHaveLength(1);
    expect(kept[0].name.startsWith("sheet.json~")).toBe(true);
    expect(JSON.parse(kept[0].text).config.banner.title).toBe("Hand edit before the update");
    expect(jsonAt(`${a1.folder}/sheet.json`)!.config.banner.title).toBe(a1.title); // the app's saved state
    expect(dirAt(`${t1.folder}/.removed versions`)).toBeUndefined(); // template.json said the same: adopted, not replaced
  });

  it("✓ Save template over a template.json changed outside the app says that this save replaced the change", async () => {
    await openLibrary();
    const t1 = await saveTemplate();
    editJson(`${t1.folder}/template.json`, (raw) => { raw.config.banner.background = "#00FF00"; });
    await click("builder-columns-inc");
    await click("builder-template-save");
    await waitUntil(() => /changes made outside the app/.test(text("builder-toast")), "the replace is reported");
    expect(jsonAt(`${t1.folder}/template.json`)!.config.banner.background).not.toBe("#00FF00");
  });
});
