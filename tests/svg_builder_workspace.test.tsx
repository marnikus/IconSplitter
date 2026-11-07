// @vitest-environment happy-dom
// svg_builder_workspace.test.tsx — the builder with a REAL scanned library
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async () => null) };
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
const FOOD = ["apple", "bread", "cake", "donut", "egg"];
const UI = ["home", "gear", "bell", "user", "mail", "lock", "star"];

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

function library(): FakeDir {
  const root = new FakeDir("icons");
  FOOD.forEach((s) => addPair(root, "food icons", s));
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
const placed = () => all('[data-testid^="builder-asset-"][data-selected="true"]').map((el) => el.dataset.assetId);

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
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.unstubAllGlobals();
});

describe("SVG builder workspace", () => {
  it("never borrows another tab's layout classes (stray-text regression)", async () => {
    await click("tab-svg-builder");
    const panel = q("builder-panel")!;
    expect(panel.classList.contains("svg-panel")).toBe(false);
    expect(panel.querySelector(".svg-panel, .up-columns")).toBeNull();
    expect(q("builder-prompt-panel")).toBeNull(); // the prompt lives in the metadata dialog now
  });

  it("places the recipe automatically after the first scan and shows empty cells", async () => {
    await openLibrary();
    expect(placed()).toHaveLength(12);
    expect(text("builder-cells")).toContain("12 of 32 cells");
    expect(all('[data-testid^="builder-empty-cell-"]')).toHaveLength(20);
    expect(text("builder-stage-status")).toContain("20 empty cells");
  });

  it("library click removes and re-adds; a full sheet refuses with the reference toast", async () => {
    await openLibrary();
    const first = placed()[0]!;
    await click(`builder-asset-${first}`);
    expect(placed()).toHaveLength(11);
    await click(`builder-asset-${first}`);
    expect(placed()).toHaveLength(12);
    for (let i = 0; i < 3; i++) await click("builder-rows-dec"); // 8 × 1 = 8 cells
    await waitUntil(() => placed().length === 8, "selection truncated to 8 cells");
    const tile = all('[data-testid^="builder-asset-"][data-selected="false"]')[0];
    await act(async () => { tile.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(text("builder-toast")).toContain("Every cell is filled");
  });

  it("a locked icon keeps its cell through Reshuffle; the seed re-rolls", async () => {
    await openLibrary();
    const seed = text("builder-seed");
    const before = q("builder-cell-lock-2")!;
    await act(async () => { before.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(text("builder-locked-count")).toBe("1 locked");
    const lockedId = (await idsInOrder())[2];
    await click("builder-reshuffle-stage");
    expect(text("builder-seed")).not.toBe(seed);
    expect((await idsInOrder())[2]).toBe(lockedId);
  });

  it("Similar mode with a multi-word category profile fills from that category first", async () => {
    await openLibrary();
    const select = q("builder-recipe-profile") as HTMLSelectElement;
    await act(async () => { select.value = "food icons"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle(0);
    expect(text("builder-recipe-caption")).toBe("70% tag match · food icons");
    expect(text("builder-toast")).toContain("Only 5 icons meet ≥70% metadata match");
  });

  it("presets, CUSTOM pill, RESET and the global undo", async () => {
    await openLibrary();
    await click("builder-layout-plain");
    expect(text("builder-section-grid")).toContain("8 × 3");
    expect(q("builder-banner-hidden")).not.toBeNull();
    await click("builder-columns-inc");
    expect(q("builder-custom-pill")).not.toBeNull();
    await click("builder-undo");
    expect(text("builder-section-grid")).toContain("8 × 3");
    await click("builder-reset");
    expect(text("builder-section-grid")).toContain("8 × 4");
  });

  it("a typed width clamps to the range instead of snapping back to the default", async () => {
    await openLibrary();
    await click("builder-section-artboard"); // collapsed by default → open
    const head = q("builder-section-artboard")!.querySelector("button")!;
    if (q("builder-width") === null) await act(async () => { head.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const field = q("builder-width") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "1");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(text("builder-stage-status")).toContain("320 × 660 px");
  });

  it("zoom: 1:1, minus and fit; Export menu lists the reference items plus Load preset", async () => {
    await openLibrary();
    await click("builder-zoom-1");
    expect(text("builder-zoom")).toBe("100%");
    await click("builder-zoom-out");
    expect(text("builder-zoom")).toBe("90%");
    await click("builder-export-toggle");
    expect(all('[data-testid^="builder-export-"][role="menuitem"]').map((el) => el.dataset.testid))
      .toEqual(["builder-export-svg", "builder-export-png", "builder-export-copy", "builder-export-preset", "builder-export-load"]);
  });

  it("Sheet metadata opens the prompt and Gemini card; the brief has Brief and Raw views", async () => {
    await openLibrary();
    await click("builder-open-metadata");
    expect(q("builder-prompt-panel")).not.toBeNull();
    expect(q("builder-provider-card")).not.toBeNull();
    await click("builder-meta-setup-close");
    await click("builder-brief");
    await click("builder-brief-tab-raw");
    expect(text("builder-brief-raw")).toContain("# Product brief");
  });
});

/** Placed ids in cell order, read from the composed artboard SVG. */
async function idsInOrder(): Promise<string[]> {
  const svg = q("builder-artboard")!.querySelector(".bld-artboard-svg")!.shadowRoot!.innerHTML;
  return [...svg.matchAll(/data-asset-id="([^"]+)" data-approved="true" data-cell-index="(\d+)"/g)]
    .sort((a, b) => Number(a[2]) - Number(b[2])).map((m) => m[1]);
}
