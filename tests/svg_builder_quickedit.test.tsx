// @vitest-environment happy-dom
// svg_builder_quickedit.test.tsx — quick editing on a REAL scanned library
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

import { cleanHex, smartSwatches } from "../src/lib/svgBuilder/swatches";
import { quickTargetOf } from "../src/svgBuilder/quickedit";
import { toolbarSize } from "../src/svgBuilder/quickplace";
import { freeSpot } from "../src/lib/svgBuilder/freespot";

// Quick editing on the artboard (2026-11-14): hover → toolbar → colour, stroke,
// font and size panels; smart swatches near the current colour.

describe("free spot for a toolbar", () => {
  const area = { x: 0, y: 0, width: 300, height: 200 };
  const size = { width: 60, height: 30 };
  it("takes the top-right corner inside when it is free", () => {
    expect(freeSpot(area, size, [])).toEqual({ x: 234, y: 6 });
  });
  it("avoids every obstacle and stays inside the area", () => {
    const icons = [{ x: 200, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 120, height: 60 }];
    const p = freeSpot(area, size, icons)!;
    const t = { ...p, ...size };
    for (const o of icons) expect(t.x < o.x + o.width + 4 && o.x < t.x + t.width + 4 && t.y < o.y + o.height + 4 && o.y < t.y + t.height + 4).toBe(false);
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.y + t.height).toBeLessThanOrEqual(200);
  });
  it("answers null when nothing fits", () => {
    expect(freeSpot({ x: 0, y: 0, width: 40, height: 20 }, size, [])).toBeNull();
    expect(freeSpot(area, size, [area])).toBeNull();
  });
});

describe("quick edit — the pure part", () => {
  it("suggests six distinct colours near the current one, never the current itself", () => {
    const s = smartSwatches("#60409C");
    expect(s).toHaveLength(6);
    expect(new Set(s).size).toBe(6);
    expect(s).not.toContain("#60409C");
    expect(s.every((c) => /^#[0-9A-F]{6}$/.test(c))).toBe(true);
    expect(smartSwatches("#FFFFFF")).toHaveLength(6); // works at the edges and for greys
    expect(cleanHex(" a8f0e8 ")).toBe("#A8F0E8");
    expect(cleanHex("#12")).toBeNull();
  });

  it("knows what the pointer is over from the event path", () => {
    const el = (attrs: Record<string, string>, cls = "") => {
      const e = document.createElement("div");
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (cls) e.className = cls;
      return e;
    };
    expect(quickTargetOf([el({ "data-banner-text": "title" }), el({ "data-banner": "true" })])?.kind).toBe("title");
    expect(quickTargetOf([el({ "data-cell-index": "-1" }), el({ "data-banner-hero": "true" }), el({ "data-banner": "true" })])?.kind).toBe("hero");
    expect(quickTargetOf([el({}, "bld-cell")])?.kind).toBe("icon");
    expect(quickTargetOf([el({ "data-split-block": "true" }), el({ "data-banner": "true" })])?.kind).toBe("block");
    expect(quickTargetOf([el({}), el({ "data-banner": "true" })])?.kind).toBe("banner");
    expect(quickTargetOf([el({ "data-artboard": "true" })])?.kind).toBe("canvas");
    expect(quickTargetOf([el({})])).toBeNull();
  });
});

const shadow = () => q("builder-artboard")!.querySelector(".bld-artboard-svg")!.shadowRoot!;
async function hover(target: Element, clientX = 10, clientY = 10): Promise<void> {
  await act(async () => { target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true, clientX, clientY })); });
}
async function slide(id: string, value: string): Promise<void> {
  const input = q(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
}
const config = () => JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.config.v1") ?? "{}");

describe("quick edit on the artboard", () => {
  it("stays put while the pointer moves over the same big area, so it can be clicked (2026-11-14)", async () => {
    await openLibrary();
    const bg = shadow().querySelector('[data-artboard="true"]')!;
    await hover(bg, 100, 100);
    const at = () => `${q("builder-quick")!.style.left}|${q("builder-quick")!.style.top}`;
    const first = at();
    await hover(bg, 300, 250); // the pointer moves on: the toolbar does not follow
    expect(at()).toBe(first);
    await hover(shadow().querySelector('[data-banner="true"] > rect')!, 50, 50); // another element: it moves there
    expect(q("builder-quick")?.dataset.kind).toBe("banner");
  });

  it("hovering an icon offers its colour (smart swatches, hex, Done) and its stroke", async () => {
    await openLibrary();
    await hover(host.querySelector(".bld-cell")!);
    expect(q("builder-quick")?.dataset.kind).toBe("icon");
    await click("builder-quick-color");
    const swatch = host.querySelector('[data-testid^="builder-quick-swatch-"]') as HTMLElement;
    const picked = `#${swatch.dataset.testid!.replace("builder-quick-swatch-", "")}`;
    await act(async () => { swatch.click(); });
    expect(config().icons.color).toBe(picked);
    const hex = q("builder-quick-hex") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(hex, "#60409c"); hex.dispatchEvent(new Event("input", { bubbles: true })); });
    await click("builder-quick-done");
    expect(config().icons.color).toBe("#60409C");
    expect(q("builder-quick-color-panel")).toBeNull();

    await hover(host.querySelector(".bld-cell")!);
    await click("builder-quick-stroke");
    await slide("builder-quick-stroke-range", "2.9");
    expect(config().icons.strokeWidth).toBe(2.9);
  });

  it("hovering the title offers its colour, font and size; the background and banner offer their colours", async () => {
    await openLibrary();
    await hover(shadow().querySelector('[data-banner-text="title"]')!);
    expect(q("builder-quick")?.dataset.kind).toBe("title");
    await click("builder-quick-text");
    const face = q("builder-quick-face") as HTMLSelectElement;
    await act(async () => { face.value = "serif"; face.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(config().banner.titleFace).toBe("serif");
    await slide("builder-quick-size", "40");
    expect(config().banner.titleSize).toBe(40);
    await act(async () => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); }); // click outside closes

    await hover(shadow().querySelector('[data-artboard="true"]')!);
    expect(q("builder-quick")?.dataset.kind).toBe("canvas");
    expect(q("builder-quick-stroke")).toBeNull(); // a background has a colour only
    await hover(shadow().querySelector('[data-banner="true"] > rect')!);
    expect(q("builder-quick")?.dataset.kind).toBe("banner");
    await click("builder-quick-color");
    const swatch = host.querySelector('[data-testid^="builder-quick-swatch-"]') as HTMLElement;
    await act(async () => { swatch.click(); });
    expect(config().banner.background).toBe(`#${swatch.dataset.testid!.replace("builder-quick-swatch-", "")}`);
    await click("builder-undo"); // one undo entry per quick change
    expect(config().banner.background).toBe("#17271F");
  });
});

// 2026-11-14: move the text right on the artboard; number boxes apply as you type.
describe("quick toolbar regressions (2026-11-14)", () => {
  it("an open panel survives the pointer leaving the artboard, and hovering works again after it closes", async () => {
    await openLibrary();
    await hover(shadow().querySelector('[data-artboard="true"]')!, 120, 80);
    await click("builder-quick-color");
    await act(async () => { q("builder-artboard")!.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); }); // the hide timer runs out
    expect(q("builder-quick-color-panel")).not.toBeNull(); // still open, toolbar still there
    await click("builder-quick-done");
    await hover(host.querySelector(".bld-cell")!);
    expect(q("builder-quick")?.dataset.kind).toBe("icon"); // the editor did not stop working
  });

  it("has one place per element, never at the pointer", async () => {
    await openLibrary();
    const bg = shadow().querySelector('[data-artboard="true"]')!;
    await hover(bg, 30, 30);
    const one = `${q("builder-quick")!.style.left}|${q("builder-quick")!.style.top}`;
    await act(async () => { q("builder-artboard")!.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    await hover(bg, 400, 300); // a later visit from another spot: the same place
    expect(`${q("builder-quick")!.style.left}|${q("builder-quick")!.style.top}`).toBe(one);
  });

  it("puts the background toolbar on free background: inside the artboard, clear of the banner and every icon cell", async () => {
    await openLibrary();
    await hover(shadow().querySelector('[data-artboard="true"]')!, 30, 30);
    const bar = q("builder-quick")!;
    const t = { x: parseFloat(bar.style.left), y: parseFloat(bar.style.top), width: toolbarSize("canvas").width, height: toolbarSize("canvas").height };
    const config = JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.config.v1") ?? "{}");
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.y).toBeGreaterThanOrEqual(0);
    expect(t.x + t.width).toBeLessThanOrEqual(config.artboard.width);
    const hit = (r: { x: number; y: number; width: number; height: number }) =>
      t.x < r.x + r.width && r.x < t.x + t.width && t.y < r.y + r.height && r.y < t.y + t.height;
    const cells = [...host.querySelectorAll<HTMLElement>(".bld-cell, .bld-cell-empty")].map((c) => ({
      x: parseFloat(c.style.left), y: parseFloat(c.style.top), width: parseFloat(c.style.width), height: parseFloat(c.style.height),
    }));
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.some(hit)).toBe(false);
    expect(t.x).toBeGreaterThanOrEqual(config.banner.size); // the left banner is not free background
  });
});

describe("move text on the artboard", () => {
  const ptr = (type: string, x: number, y: number) => new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  async function drag(id: string, from: [number, number], to: [number, number]): Promise<void> {
    await act(async () => { q(id)!.dispatchEvent(ptr("pointerdown", ...from)); });
    await act(async () => { window.dispatchEvent(ptr("pointermove", ...to)); });
    await act(async () => { window.dispatchEvent(ptr("pointerup", ...to)); });
  }

  it("✥ opens a frame: side handles move the title on one axis, at once, with a badge; arrows nudge; Apply closes", async () => {
    await openLibrary();
    await hover(shadow().querySelector('[data-banner-text="title"]')!);
    await click("builder-quick-move");
    expect(q("builder-quick-move-frame")?.dataset.which).toBe("title");

    await drag("builder-quick-move-right", [100, 100], [112, 140]); // a left/right handle: only X moves
    expect(config().banner).toMatchObject({ titleDx: 12, titleDy: 0 });
    expect(text("builder-quick-move-badge")).toBe("X +12 px");
    await drag("builder-quick-move-top", [50, 50], [90, 42]); // a top/bottom handle: only Y moves
    expect(config().banner).toMatchObject({ titleDx: 12, titleDy: -8 });
    await drag("builder-quick-move-body", [0, 0], [3, 4]); // the text itself: both
    expect(config().banner).toMatchObject({ titleDx: 15, titleDy: -4 });

    const frame = q("builder-quick-move-frame")!;
    await act(async () => { frame.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true })); });
    expect(config().banner.titleDx).toBe(5);
    expect((q("builder-title-move-x") as HTMLInputElement).value).toBe("5"); // the side widget follows

    await click("builder-quick-move-apply");
    expect(q("builder-quick-move-frame")).toBeNull();
  });
});

describe("number boxes apply as you type", () => {
  async function type(id: string, value: string): Promise<void> {
    const input = q(id) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  }

  it("applies a value in range without Enter or leaving the box; an out-of-range one waits, then clamps", async () => {
    await openLibrary();
    await type("builder-title-move-x", "15");
    expect(config().banner.titleDx).toBe(15); // no blur, no Enter
    if (q("builder-width") === null) await act(async () => { q("builder-section-artboard")!.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await type("builder-width", "1"); // on the way to 1080: below the 320 minimum, not applied yet
    expect(config().artboard.width).toBe(1080);
    await type("builder-width", "1200");
    expect(config().artboard.width).toBe(1200);
    await type("builder-width", "99999");
    expect(config().artboard.width).toBe(1200);
    await act(async () => { (q("builder-width") as HTMLInputElement).blur(); q("builder-width")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(config().artboard.width).toBe(3000); // left the box: clamped
  });

  it("the banner icon's toolbar controls its circle stroke and size, the icon's size, and both at once (2026-11-14)", async () => {
    await openLibrary();
    const hero = shadow().querySelector("[data-banner-hero]");
    expect(hero).not.toBeNull();
    await hover(hero!);
    expect(q("builder-quick")?.dataset.kind).toBe("hero");
    await click("builder-quick-stroke");
    await slide("builder-quick-stroke-range", "2.2");
    expect(config().banner.heroStroke).toBe(2.2);
    await click("builder-quick-ring");
    await slide("builder-quick-ring-stroke", "3");
    await slide("builder-quick-ring-size", "120");
    expect(config().banner).toMatchObject({ ringStroke: 3, ringScale: 120, heroStroke: 2.2 });
    await click("builder-quick-scale");
    await slide("builder-quick-hero-size", "100");
    await slide("builder-quick-both", "150");
    expect(config().banner).toMatchObject({ heroScale: 150, ringScale: 180 }); // the circle keeps its 1.2× ratio
    expect(shadow().querySelector("[data-banner-ring]")?.getAttribute("stroke-width")).toBe("3");
  });

  it("keeps the toolbar where it opened while its panel is open, even when the element moves (2026-11-14)", async () => {
    await openLibrary();
    let shift = 0;
    const real = Element.prototype.getBoundingClientRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.getAttribute("data-banner-text") !== "subtitle") return real.call(this);
      return { left: 100 + shift, top: 50 + shift, right: 400 + shift, bottom: 110 + shift, width: 300, height: 60, x: 100 + shift, y: 50 + shift, toJSON: () => ({}) } as DOMRect;
    });
    try {
      await hover(shadow().querySelector('[data-banner-text="subtitle"]')!);
      const at = () => `${q("builder-quick")!.style.left}|${q("builder-quick")!.style.top}`;
      const opened = at();
      await click("builder-quick-text");
      shift = 40; // editing the size moves the text
      await slide("builder-quick-size", "20");
      expect(at()).toBe(opened);
      await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      await hover(shadow().querySelector('[data-banner-text="subtitle"]')!);
      expect(at()).not.toBe(opened); // closed and reopened: it goes to the element's new place
    } finally { spy.mockRestore(); }
  });
});
