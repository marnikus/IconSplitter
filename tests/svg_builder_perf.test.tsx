// @vitest-environment happy-dom
// svg_builder_perf.test.tsx — the SVG builder's work budget (2026-11-15): a real
// scanned library with 12 templates and 20 final artboards, then the everyday
// gestures (dragging a slider, hovering the artboard, toggling an icon, typing
// the title). The REAL composer is wrapped to count full sheet compositions —
// the expensive step (every icon sanitised, every text measured, a data URL per
// preview). The budgets catch a regression where one small edit recomposes
// every template / artboard picture again.
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

const counter = vi.hoisted(() => ({ compose: 0 }));
vi.mock("../src/lib/svgBuilder/compose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/svgBuilder/compose")>();
  return { ...actual, composeSheet: (...args: Parameters<typeof actual.composeSheet>) => { counter.compose += 1; return actual.composeSheet(...args); } };
});
const handles = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, saveHandles: vi.fn(async (name: string, h: unknown) => { handles.set(name, h); }), loadHandles: vi.fn(async (name: string) => handles.get(name) ?? null) };
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
const NAMES = Array.from({ length: 40 }, (_, i) => `icon${String(i).padStart(2, "0")}`);

function library(): FakeDir {
  const root = new FakeDir("icons");
  const dir = new FakeDir("set");
  root.children.set("set", dir);
  for (const stem of NAMES) {
    const meta = serializePairMeta(pairFile("set", `${stem}_AI.png`, { versions: [svgVersion(`set/${stem}_AI.svg`, { version: 1, review: "approved" })] }));
    dir.children.set(`${stem}_AI.png`, new FakeFile(`${stem}_AI.png`, 20, 3100, "ai"));
    dir.children.set(`${stem}_AI.svg`, new FakeFile(`${stem}_AI.svg`, SVG.length, 3400, SVG));
    dir.children.set(`${stem}_AI.svg.json`, new FakeFile(`${stem}_AI.svg.json`, meta.length, 3500, meta));
  }
  return root;
}

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (id: string) => {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
};
async function slide(id: string, value: string): Promise<void> {
  const input = q(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
}
const shadow = () => q("builder-artboard")!.querySelector(".bld-artboard-svg")!.shadowRoot!;

beforeEach(() => {
  handles.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  localStorage.clear();
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
  vi.unstubAllGlobals();
});

/** 12 templates (each its own grid) and 20 artboards, built through the UI. */
async function bigWorkspace(): Promise<void> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed", 4000);
  await click("builder-template-save");
  for (let i = 1; i < 12; i++) {
    await click("builder-columns-inc");
    await click("builder-template-save-new");
  }
  const tpl = JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.templates.v1") ?? "[]")[0].id as string;
  for (let i = 0; i < 20; i++) await click(`builder-template-add-artboard-${tpl}`);
  await settle(50);
}

/** Compositions and wall time of one gesture. */
async function measure(gesture: () => Promise<void>): Promise<{ compose: number; ms: number }> {
  await settle(20);
  counter.compose = 0;
  const t0 = performance.now();
  await gesture();
  await settle(20);
  return { compose: counter.compose, ms: Math.round(performance.now() - t0) };
}

describe("SVG builder work budget (12 templates, 20 artboards)", () => {
  it("everyday gestures recompose only what changed", async () => {
    await bigWorkspace();
    const report: Record<string, { compose: number; ms: number }> = {};
    report.slider20 = await measure(async () => { for (let v = 30; v < 50; v++) await slide("builder-gap-x", String(v)); });
    report.hover50 = await measure(async () => {
      const bg = shadow().querySelector('[data-artboard="true"]')!;
      for (let i = 0; i < 50; i++) await act(async () => { bg.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true, clientX: 100 + i, clientY: 120 })); });
    });
    report.toggleIcon = await measure(async () => {
      const tile = host.querySelector('[data-testid^="builder-asset-"][data-asset-id]') as HTMLElement;
      await act(async () => { tile.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    });
    report.idle2s = await measure(async () => { await settle(2000); }); // nothing happens: nothing may run
    report.type10 = await measure(async () => {
      const input = q("builder-title") as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      for (const ch of "abcdefghij") await act(async () => { setter.call(input, input.value + ch); input.dispatchEvent(new Event("input", { bubbles: true })); });
    });
    report.reopen = await measure(async () => { // a fresh start: the remembered folder is restored by itself
      act(() => ui.unmount());
      ui = createRoot(host);
      act(() => { ui.render(<Workbench />); });
      await click("tab-svg-builder");
      await waitUntil(() => q("builder-artboard") !== null, "sheet composed", 4000);
      await settle(200);
    });
    console.log("PERF", JSON.stringify(report));
    // budgets (artboard + at most the pictures that really changed)
    expect(report.hover50.compose).toBe(0); // hovering never recomposes
    expect(report.slider20.compose).toBeLessThanOrEqual(20 * 2); // the stage (+ the open artboard's row picture)
    expect(report.toggleIcon.compose).toBeLessThanOrEqual(1); // the stage only — template pictures use a stable sample
    expect(report.reopen.compose).toBeLessThanOrEqual(1 + 12 + 20 + 2); // each picture ONCE, plus the stage
    expect(report.idle2s.compose).toBe(0);
  }, 120_000);
});
