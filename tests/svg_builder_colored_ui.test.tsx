// @vitest-environment happy-dom
// svg_builder_colored_ui.test.tsx — colored icons on the stage (2026-11-23):
// icons of a registered style (`_colored_wiggle`) keep their own strokes and
// fills; "Colored icons" in Customize and the colored-icon quick toolbar set the
// strokes' colour / width and the fills' colour — strokes and fills apart, ↺
// back to every icon's own — and never touch the line-stroke icons.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
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
const COLORED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path id="blob" d="M4 12c4-6 12-6 16 0z" fill="#F5A623"/>'
  + '<path id="outline" d="M3 3h18v18H3z" fill="none" stroke="#1F2937" stroke-width="2"/></svg>';

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
function addIcon(root: FakeDir, dir: string, stem: string, colored: boolean): void {
  addFiles(root, dir, `${stem}_AI`, serializePairMeta(pairFile(dir, `${stem}_AI.png`, { versions: [svgVersion(`${dir}/${stem}_AI.svg`, { version: 1, review: "approved" })] })), LINE);
  if (!colored) return;
  const styleDir = `${dir}/_colored_wiggle`, name = `${stem}_AI_colored_wiggle`;
  addFiles(root, styleDir, name, serializePairMeta(pairFile(styleDir, `${name}.png`, { id: `${stem}~colored_wiggle`,
    versions: [svgVersion(`${styleDir}/${name}.svg`, { version: 1, review: "approved" })] })), COLORED);
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
async function setValue(id: string, value: string): Promise<void> {
  const input = q(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle(0);
}
async function hover(target: Element): Promise<void> {
  await act(async () => { target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true, clientX: 10, clientY: 10 })); });
  await settle(0);
}
const icons = () => JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.config.v1") ?? "{}").icons as Record<string, unknown>;
const shadow = () => q("builder-artboard")!.querySelector(".bld-artboard-svg")!.shadowRoot!;
const cells = (colored: boolean) => [...shadow().querySelectorAll("[data-cell-index]")]
  .filter((g) => g.getAttribute("data-cell-index") !== "-1" && (g.getAttribute("data-asset-id") ?? "").endsWith("~colored_wiggle") === colored);
const partOf = (g: Element, id: string) => g.querySelector(`[id$="-${id}"]`)!;
const scaleOf = (g: Element) => Number(/scale\(([\d.]+)\)/.exec(g.getAttribute("transform") ?? "")?.[1]);

async function openLibrary(): Promise<void> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => text("builder-library-count") === "10", "library scanned");
  await waitUntil(() => cells(true).length === 4 && cells(false).length === 6, "both kinds on the sheet");
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

describe("colored icons on the stage (2026-11-23)", () => {
  it("keep their own paints; Customize ▸ Colored icons sets the fills or the strokes only — ↺ back to their own", async () => {
    await openLibrary();
    expect(cells(true).every((g) => partOf(g, "blob").getAttribute("fill") === "#F5A623" && partOf(g, "outline").getAttribute("stroke") === "#1F2937")).toBe(true);
    expect(q("builder-colored-icons")).not.toBeNull();

    await setValue("builder-colored-fill", "#00ff00");
    await waitUntil(() => icons().coloredFill === "#00FF00", "fill colour set");
    await waitUntil(() => cells(true).every((g) => partOf(g, "blob").getAttribute("fill") === "#00FF00"), "fills repainted");
    expect(cells(true).every((g) => partOf(g, "outline").getAttribute("stroke") === "#1F2937" && partOf(g, "outline").getAttribute("fill") === "none")).toBe(true);
    expect(cells(false).every((g) => g.getAttribute("stroke") === "currentColor" && g.querySelector("path")?.getAttribute("fill") === "none")).toBe(true);

    await click("builder-colored-fill-own");
    await waitUntil(() => icons().coloredFill === "" && cells(true).every((g) => partOf(g, "blob").getAttribute("fill") === "#F5A623"), "own fills back");

    await setValue("builder-colored-width", "3");
    await waitUntil(() => icons().coloredStrokeWidth === 3, "stroke width set");
    await waitUntil(() => cells(true).every((g) => Math.abs(Number(partOf(g, "outline").getAttribute("stroke-width")) * scaleOf(g) - 3) < 0.02), "strokes repainted in artboard px");
    expect(cells(true).every((g) => partOf(g, "blob").getAttribute("stroke") === "none")).toBe(true); // a fill never gets a stroke
  });

  it("hovering a colored icon opens its own toolbar: stroke ring, fill dot — the line icon keeps the outlined toolbar", async () => {
    await openLibrary();
    await hover(cells(true)[0]);
    await waitUntil(() => q("builder-quick")?.dataset.kind === "styled", "colored-icon toolbar");
    expect(q("builder-quick-color")?.className).toMatch(/is-ring/);
    expect(q("builder-quick-fill")?.className).toMatch(/is-own/); // each icon's own fill, for now
    await click("builder-quick-fill");
    expect(q("builder-quick-own-note")?.textContent).toBe("Own fill colors");
    const swatch = host.querySelector('[data-testid^="builder-quick-swatch-"]') as HTMLElement;
    const hex = `#${swatch.dataset.testid!.replace("builder-quick-swatch-", "")}`.toUpperCase();
    await act(async () => { swatch.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle(0);
    expect(icons().coloredFill).toBe(hex);
    expect(icons().coloredStroke).toBe(""); // the strokes keep their own
    await click("builder-quick-own");
    expect(icons().coloredFill).toBe("");

    await click("builder-quick-done");
    await hover(cells(false)[0]);
    await waitUntil(() => q("builder-quick")?.dataset.kind === "icon", "outlined toolbar");
    expect(q("builder-quick-fill")).toBeNull();
  });
});
