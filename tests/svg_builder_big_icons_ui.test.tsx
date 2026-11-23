// @vitest-environment happy-dom
// svg_builder_big_icons_ui.test.tsx — big icons on the stage (2026-11-23): ⊞ in
// an icon's quick toolbar marks its cell (a bright red frame); the fourth mark
// of a 2 × 2 square combines the four cells into one big icon (the first
// marked one's) as one undo step. On the big icon: ≡ sets its own stroke, ✕
// breaks it back into the same four icons; the global ≡ is not offered there.
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

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
const STEMS = ["apple", "bread", "cake", "home", "gear", "bell", "fish", "milk", "corn", "salt", "rice", "tea"];

function addPair(root: FakeDir, stem: string): void {
  let node = root.children.get("icons") as FakeDir | undefined;
  if (node === undefined) { node = new FakeDir("icons"); root.children.set("icons", node); }
  const meta = serializePairMeta(pairFile("icons", `${stem}_AI.png`, { versions: [svgVersion(`icons/${stem}_AI.svg`, { version: 1, review: "approved" })] }));
  node.children.set(`${stem}_AI.png`, new FakeFile(`${stem}_AI.png`, 20, 3100, "ai"));
  node.children.set(`${stem}_AI.svg`, new FakeFile(`${stem}_AI.svg`, SVG.length, 3400, SVG));
  node.children.set(`${stem}_AI.svg.json`, new FakeFile(`${stem}_AI.svg.json`, meta.length, 3500, meta));
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
async function hover(id: string): Promise<void> {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true, clientX: 10, clientY: 10 })); });
  await settle(0);
}
async function mark(slot: number): Promise<void> {
  await hover(`builder-cell-${slot}`);
  await click("builder-quick-merge-mark");
}
async function setRange(id: string, value: string): Promise<void> {
  const input = q(id) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle(0);
}
const merges = () => (JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.config.v1") ?? "{}").grid?.merges ?? []) as { strokeWidth: number }[];
const shadow = () => q("builder-artboard")!.querySelector(".bld-artboard-svg")!.shadowRoot!;
/** The drawn icons: slot → asset id. */
const drawn = () => Object.fromEntries([...shadow().querySelectorAll("[data-cell-index]")]
  .filter((g) => g.getAttribute("data-cell-index") !== "-1").map((g) => [Number(g.getAttribute("data-cell-index")), g.getAttribute("data-asset-id")]));
const scaleAt = (slot: number) => Number(/scale\(([\d.]+)\)/.exec(shadow().querySelector(`[data-cell-index="${slot}"]`)!.getAttribute("transform") ?? "")![1]);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  resetAppStore();
  const root = new FakeDir("root");
  STEMS.forEach((s) => addPair(root, s));
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

describe("big icons on the stage (2026-11-23)", () => {
  it("⊞ marks four cells of a 2 × 2 square → one big icon; ≡ its own stroke; ✕ brings the four icons back; Undo merges again", async () => {
    await click("tab-svg-builder");
    await click("builder-open-folder");
    await waitUntil(() => text("builder-library-count") === "12", "library scanned");
    await waitUntil(() => Object.keys(drawn()).length === 12, "sheet filled");
    const before = drawn();
    const columns = Number(/(\d+) ×/.exec(text("builder-section-grid"))?.[1] ?? 8);
    const small = scaleAt(1);

    await mark(columns + 1); // bottom-right first: its icon becomes the big one
    expect(q(`builder-cell-${columns + 1}`)?.className).toMatch(/is-marked/);
    await mark(0);
    await mark(1);
    expect(merges()).toEqual([]);
    await mark(columns);
    await waitUntil(() => merges().length === 1, "combined");
    expect(Object.keys(drawn())).toHaveLength(12 - 3);
    const big = Number(host.querySelector(".bld-cell.is-big")!.getAttribute("data-cell-index"));
    expect(drawn()[big]).toBe(before[columns + 1]);
    expect(scaleAt(big)).toBeGreaterThan(small * 1.9);
    expect(host.querySelector(".bld-cell.is-marked")).toBeNull(); // the marks went with the merge

    await hover(`builder-cell-${big}`);
    expect(q("builder-quick-stroke")).toBeNull(); // the sheet's stroke is not this icon's
    await click("builder-quick-merge-stroke");
    await setRange("builder-quick-merge-stroke-range", "3");
    await waitUntil(() => merges()[0]?.strokeWidth === 3, "own stroke");
    await click("builder-quick-merge-break");
    await waitUntil(() => merges().length === 0, "broken");
    expect(drawn()).toEqual(before); // the same four icons, each in its own cell again

    await click("builder-undo");
    await waitUntil(() => merges().length === 1, "undo merges again");
  });
});
