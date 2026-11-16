// @vitest-environment happy-dom
// svg_builder_decline.test.tsx — 🗑 remove from approved on a REAL scanned library
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
    loadHandles: vi.fn(async (name: string) => (stored.get(name) as never) ?? null) };
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

// 🗑 on an artboard icon (2026-11-13): decline it in Generate SVG — no longer
// approved — as one undoable step; the builder follows the written decision.

const libraryCount = () => Number(text("builder-library-count"));
/** The pair files that now say "declined". */
const declined = () => ["food icons", "interface"]
  .flatMap((dir) => [...((scanned.children.get(dir) as FakeDir | undefined)?.children.values() ?? [])])
  .filter((f) => f.name.endsWith(".svg.json") && (f as FakeFile).text.includes("declined")).map((f) => f.name);

describe("🗑 remove an icon from approved", () => {
  it("declines the icon in its pair file, takes it out of the library and the sheet, and Undo brings it back", async () => {
    await openLibrary();
    expect(q("builder-cell-decline-0")).not.toBeNull();
    const before = libraryCount();
    expect(declined()).toEqual([]);

    await click("builder-cell-decline-0");
    await waitUntil(() => libraryCount() === before - 1, "the icon left the library");
    expect(declined()).toHaveLength(1); // exactly that icon's pair file
    expect(q("builder-empty-cell-0")).not.toBeNull(); // its cell stays empty, nothing shifts
    expect(text("builder-toast")).toMatch(/declined in Generate SVG.*Undo/);

    await click("builder-undo");
    await waitUntil(() => libraryCount() === before, "approved again and back in the library");
    expect(declined()).toEqual([]);
    await click("builder-redo");
    await waitUntil(() => libraryCount() === before - 1, "declined again by Redo");
  });

  it("a declined icon leaves every saved artboard too, so no artboard ever shows it as Unavailable (2026-11-14)", async () => {
    await openLibrary();
    const arts = () => JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.artboards.v1") ?? "[]") as Array<{ id: string; placedIds: string[] }>;
    const tpls = () => JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.templates.v1") ?? "[]") as Array<{ id: string }>;
    await click("builder-template-save");
    const [tpl] = tpls();
    await click(`builder-template-add-artboard-${tpl.id}`);
    const [first] = arts();
    const gone = first.placedIds[0]; // the first artboard's one icon
    await click(`builder-template-add-artboard-${tpl.id}`);
    await click("builder-clear"); // the second artboard (open) gets the same icon in its first cell
    const tile = host.querySelector(`[data-testid^="builder-asset-"][data-asset-id="${gone}"]`) as HTMLElement;
    await act(async () => { tile.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle(0);
    // its random start icon may already be that very icon: then nothing is unsaved and there is no Save
    if (q("builder-stage-artboard-save") !== null) await click("builder-stage-artboard-save");
    await waitUntil(() => arts()[1].placedIds[0] === gone, "the second artboard holds it too");

    await click("builder-cell-decline-0"); // on the open (second) artboard
    await waitUntil(() => arts().every((a) => !a.placedIds.includes(gone)), "the icon left every saved artboard");
    expect(arts()[0].placedIds[0]).toMatch(/^~empty:/); // its cell stays, empty; nothing shifts

    const row = q(`builder-artboard-${first.id}`)!;
    await act(async () => { row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
    await settle(0);
    const svg = q("builder-artboard")!.querySelector(".bld-artboard-svg")!.shadowRoot!.innerHTML;
    expect(svg).not.toContain("Unavailable");
    expect(svg).not.toContain(`data-asset-id="${gone}"`);
  });
});
