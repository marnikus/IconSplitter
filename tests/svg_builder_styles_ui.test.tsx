// @vitest-environment happy-dom
// svg_builder_styles_ui.test.tsx — the STYLES filter in the pinned header
// (2026-11-23): a checkbox dropdown (All styles, Line stroke, every style the
// library has) beside Icons indexing. Only icons of the checked styles are
// listed and picked (Reshuffle, automatic placement); icons of an unchecked style
// leave the current sheet as one undo step; the choice is remembered.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { getAppState, resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { isStyledIcon } from "../src/lib/svgBuilder/iconstyles";
import { BUILDER_PREFS_KEY } from "../src/svgBuilder/prefsstore";
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

const LINE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
const COLORED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12c4-6 12-6 16 0z" fill="#F5A623"/>'
  + '<path d="M3 3h18v18H3z" fill="none" stroke="#1F2937" stroke-width="2"/></svg>';

function dirAt(root: FakeDir, path: string): FakeDir {
  return path.split("/").reduce((d, part) => {
    const next = d.children.get(part);
    if (next instanceof FakeDir) return next;
    const made = new FakeDir(part); d.children.set(part, made); return made;
  }, root);
}

function addFiles(root: FakeDir, dir: string, name: string, meta: string, svg: string): void {
  const node = dirAt(root, dir);
  node.children.set(`${name}.png`, new FakeFile(`${name}.png`, 20, 3100, "ai"));
  node.children.set(`${name}.svg`, new FakeFile(`${name}.svg`, svg.length, 3400, svg));
  node.children.set(`${name}.svg.json`, new FakeFile(`${name}.svg.json`, meta.length, 3500, meta));
}

/** A base line-stroke pair, and (optionally) its `_colored_wiggle` style pair beside it, both approved. */
function addIcon(root: FakeDir, dir: string, stem: string, colored: boolean): void {
  const meta = serializePairMeta(pairFile(dir, `${stem}_AI.png`, { versions: [svgVersion(`${dir}/${stem}_AI.svg`, { version: 1, review: "approved" })] }));
  addFiles(root, dir, `${stem}_AI`, meta, LINE);
  if (!colored) return;
  const styleDir = `${dir}/_colored_wiggle`;
  const name = `${stem}_AI_colored_wiggle`;
  const styleMeta = serializePairMeta(pairFile(styleDir, `${name}.png`, { id: `${stem}~colored_wiggle`,
    versions: [svgVersion(`${styleDir}/${name}.svg`, { version: 1, review: "approved" })] }));
  addFiles(root, styleDir, name, styleMeta, COLORED);
}

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = (id: string) => q(id)?.textContent ?? "";
async function click(id: string): Promise<void> {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
}
const placed = () => getAppState().builder.checked.filter((id) => !id.startsWith("~empty:"));
const tiles = () => [...host.querySelectorAll('[data-testid^="builder-asset-"]')].map((el) => (el as HTMLElement).dataset.assetId).filter((id): id is string => id !== undefined);
const options = () => [...host.querySelectorAll('[data-testid^="builder-style-filter-opt-"]')].map((el) => (el as HTMLElement).dataset.testid);

function mount(): void {
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
}

async function openLibrary(count: string): Promise<void> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => text("builder-library-count") === count, `library scanned (${count})`);
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  resetAppStore();
  const root = new FakeDir("icons");
  ["apple", "bread", "cake"].forEach((s, i) => addIcon(root, "food icons", s, i < 2));
  ["home", "gear", "bell"].forEach((s, i) => addIcon(root, "interface", s, i < 2));
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => root;
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

describe("STYLES filter in the pinned header (2026-11-23)", () => {
  it("offers every style of the library; Line stroke only: listed, picked and on the sheet — the rest leave as one undo step", async () => {
    await openLibrary("10");
    expect(q("builder-header-index")?.contains(q("builder-style-filter"))).toBe(true); // beside Icons indexing, in the pinned header
    expect(options()).toEqual(["builder-style-filter-opt-all", "builder-style-filter-opt-base", "builder-style-filter-opt-colored_wiggle"]);
    expect(text("builder-style-filter")).toMatch(/All styles/);
    expect(placed().some(isStyledIcon)).toBe(true); // the first sheet drew from every style

    await click("builder-style-filter-opt-base");
    await waitUntil(() => tiles().length === 6, "library: line stroke only");
    expect(tiles().every((id) => !isStyledIcon(id))).toBe(true);
    expect(text("builder-library-count")).toMatch(/^6/);
    expect(placed().length).toBeGreaterThan(0);
    expect(placed().every((id) => !isStyledIcon(id))).toBe(true); // colored icons left the sheet
    expect(text("builder-toast")).toMatch(/left the sheet/);
    expect(JSON.parse(localStorage.getItem(BUILDER_PREFS_KEY) ?? "{}").styles).toBe("base");

    await click("builder-undo"); // one step brings them back
    expect(placed().some(isStyledIcon)).toBe(true);
    await click("builder-recipe-mode-random"); // a new pick (Random needs no index): line stroke only
    expect(placed()).toHaveLength(6);
    expect(placed().every((id) => !isStyledIcon(id))).toBe(true);
    await click("builder-seed");
    expect(placed().every((id) => !isStyledIcon(id))).toBe(true);
  });

  it("Colored wiggle only: just those are listed and picked; the choice survives a reload", async () => {
    await openLibrary("10");
    await click("builder-style-filter-opt-colored_wiggle");
    await waitUntil(() => tiles().length === 4, "library: colored only");
    expect(tiles().every(isStyledIcon)).toBe(true);
    await click("builder-recipe-mode-random"); // a new pick: never a line-stroke icon, even to fill the cells
    expect(placed()).toHaveLength(4);
    expect(placed().every(isStyledIcon)).toBe(true);
    act(() => ui.unmount());
    mount();
    await openLibrary("4 / 10");
    expect(text("builder-style-filter")).toMatch(/Colored wiggle/);
  });
});
