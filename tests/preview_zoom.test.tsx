// preview_zoom.test.tsx — Ctrl+Shift + scroll zooms an SVG preview (2026-11-06):
// Generate SVG and SVG to upload row previews (both draw through SvgPreviewBox)
// and the edit mode's artboard. 10 %–400 %, toward the pointer (the point under
// it stays put); the frame keeps its size; a small "100 %" button resets.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZOOM_VIEW_MAX, ZOOM_VIEW_MIN, NO_ZOOM, zoomAt } from "../src/lib/zoomview";
import SvgPreviewBox from "../src/svg/SvgPreview";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("zoomAt", () => {
  it("zooms in on scroll up and keeps the point under the pointer still", () => {
    const v = zoomAt(NO_ZOOM, { x: 50, y: 20 }, -100);
    expect(v.scale).toBeGreaterThan(1);
    // the content point that was under (50, 20) is still there
    expect((50 - v.x) / v.scale).toBeCloseTo(50);
    expect((20 - v.y) / v.scale).toBeCloseTo(20);
  });

  it("stops at 10 % and 400 %", () => {
    let v = NO_ZOOM;
    for (let i = 0; i < 100; i++) v = zoomAt(v, { x: 0, y: 0 }, -100);
    expect(v.scale).toBe(ZOOM_VIEW_MAX);
    for (let i = 0; i < 200; i++) v = zoomAt(v, { x: 0, y: 0 }, 100);
    expect(v.scale).toBe(ZOOM_VIEW_MIN);
    expect([ZOOM_VIEW_MIN, ZOOM_VIEW_MAX]).toEqual([0.1, 4]);
  });
});

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
afterEach(() => { act(() => ui.unmount()); host.remove(); });
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
/** happy-dom's WheelEvent drops modifiers and coordinates: they are set on the event as a browser would. */
const wheel = (el: Element, deltaY: number, mods: { ctrlKey?: boolean; shiftKey?: boolean } = { ctrlKey: true, shiftKey: true }) => {
  const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
  const props = { ctrlKey: mods.ctrlKey ?? false, shiftKey: mods.shiftKey ?? false, metaKey: false, clientX: 10, clientY: 10, deltaX: 0 };
  for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });
  return el.dispatchEvent(e);
};

describe("a row preview", () => {
  const SVG = '<svg viewBox="0 0 24 24"><path d="M2 2L20 20"/></svg>';
  const mount = () => act(async () => { ui.render(<SvgPreviewBox code={SVG} box={{ width: 100, height: 100 }} testid="p" label="icon" version={1} />); });

  it("Ctrl+Shift + scroll zooms the artwork inside the same frame; 100 % resets", async () => {
    await mount();
    const art = q("[data-testid=p]") as HTMLElement;
    expect(q("[data-testid=p-zoom]")).toBeNull();
    let prevented = false;
    await act(async () => { prevented = !wheel(art, -100); });
    expect(prevented).toBe(true); // the page neither scrolls nor zooms
    expect(art.style.transform).toMatch(/scale\(1\.1/);
    expect(art.style.width).toBe("100px");
    expect(q("[data-testid=p-zoom]")?.textContent).toContain("110%");
    await act(async () => { (q("[data-testid=p-zoom]") as HTMLButtonElement).click(); });
    expect(art.style.transform).toMatch(/scale\(1\)/);
    expect(q("[data-testid=p-zoom]")).toBeNull();
  });

  it("a plain scroll still scrolls the page", async () => {
    await mount();
    const art = q("[data-testid=p]") as HTMLElement;
    let prevented = false;
    await act(async () => { prevented = !wheel(art, -100, {}); });
    expect(prevented).toBe(false);
    expect(art.style.transform).toMatch(/scale\(1\)/);
  });
});

describe("the edit mode's artboard", () => {
  it("zooms with Ctrl+Shift + scroll and resets with its 100 % button; the legend says so", async () => {
    await act(async () => {
      ui.render(<SvgPathEditor source={'<svg viewBox="0 0 24 24"><path d="M2 2L12 2"/></svg>'} box={{ width: 200, height: 200 }}
        testid="e" label="icon" onFinish={vi.fn()} onCancel={vi.fn()} />);
    });
    const art = q("[data-testid=e]") as HTMLElement;
    await act(async () => { wheel(art, -100); wheel(art, -100); });
    expect(art.style.transform).toMatch(/scale\(1\.21/);
    expect(q("[data-testid=e-zoom]")?.textContent).toContain("121%");
    await act(async () => { (q("[data-testid=e-zoom]") as HTMLButtonElement).click(); });
    expect(art.style.transform).toMatch(/scale\(1\)/);
    expect(q("[data-testid=e-legend]")?.textContent).toContain("Ctrl+Shift+Scroll");
  });
});

describe("wired", () => {
  it("SVG to upload's row preview draws through the zooming SvgPreviewBox", () => {
    expect(readFileSync("src/upload/UploadPreview.tsx", "utf8")).toContain("<SvgPreviewBox");
  });
});
