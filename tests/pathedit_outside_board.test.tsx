// pathedit_outside_board.test.tsx — the edit surface works beyond the artboard's
// border (2026-11-10). A margin of pasteboard surrounds the artboard: the LINES
// are drawn there too (the picture does not clip), the anchors and handles are
// drawn there, and — new — they react like anywhere else: a press, a drag, a
// hover, the wheel zoom all work over the margin, not only over the artboard.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// the long line starts at x = -5: its first anchor is OUTSIDE the artboard (0…100)
const SRC = '<svg viewBox="0 0 100 100"><path d="M-5 50L50 50"/><path d="M50 10L50 90"/></svg>';
const SCALE = 10;
const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });
const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
  .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype).filter((p): p is object => p !== undefined);

describe("beyond the artboard's border", () => {
  let host: HTMLDivElement;
  let ui: Root;
  let onFinish: ReturnType<typeof vi.fn<(markup: string) => void>>;
  beforeEach(() => {
    for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
    host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
    onFinish = vi.fn<(markup: string) => void>();
  });
  afterEach(() => { act(() => ui.unmount()); host.remove(); for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM; });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const art = () => q("[data-testid=e]") as HTMLElement;
  const margin = () => q("[data-testid=e-pasteboard]") as HTMLElement;
  const mount = () => act(async () => { ui.render(<SvgPathEditor source={SRC} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={onFinish} onCancel={vi.fn()} />); });
  const at = (el: Element, type: string, x: number, y: number, init: PointerEventInit = {}) => act(async () => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1, ...init }));
  });

  it("the picture itself does not clip, and the art is not wrapped in a clip group any more", async () => {
    await mount();
    const shadow = art().shadowRoot as ShadowRoot;
    expect(shadow.innerHTML).toContain("overflow:visible");
    expect(shadow.querySelector("clipPath")).toBeNull();
    expect(shadow.querySelector("[data-art-clip]")).toBeNull();
    expect(shadow.querySelectorAll("[data-edit-path]")).toHaveLength(2);
  });

  it("a margin layer sits behind the art inside the board, so it takes the events the art does not", async () => {
    await mount();
    const board = q(".svg-edit-board") as HTMLElement;
    expect(margin().parentElement).toBe(board);
    expect(Array.from(board.children).indexOf(margin())).toBeLessThan(Array.from(board.children).indexOf(art()));
  });

  it("a press on an anchor that lies outside the artboard picks it, and a drag moves it", async () => {
    await mount();
    await at(art(), "pointerdown", 20, 50); await at(art(), "pointerup", 20, 50); // picks the long line (inside)
    await at(margin(), "pointerdown", -5, 50);   // its first anchor, beyond the border
    await at(margin(), "pointermove", -9, 53);
    await at(margin(), "pointerup", -9, 53);
    expect((q("[data-testid=e-finish]") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { q("[data-testid=e-finish]")?.click(); });
    expect(onFinish.mock.calls[0][0]).toContain('d="M-9 53L50 50"');
  });

  it("a click on a line outside the artboard picks its object", async () => {
    await mount();
    await at(margin(), "pointerdown", -3, 50); await at(margin(), "pointerup", -3, 50);
    expect(q("[data-testid=e-pick]")).toBeNull(); // the "click a shape" hint is gone: an object is picked
  });

  it("Ctrl + scroll over the margin zooms the artwork like over the artboard", async () => {
    await mount();
    const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
    for (const [k, v] of Object.entries({ ctrlKey: true, shiftKey: false, metaKey: false, clientX: -50, clientY: 500, deltaX: 0 })) Object.defineProperty(e, k, { value: v });
    await act(async () => { margin().dispatchEvent(e); });
    expect(art().style.transform).toMatch(/scale\(1\.1/);
  });

  it("the frame shows a pasteboard ring round the artboard and clips only at its edge", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/\.svg-edit-board\s*\{[^}]*box-shadow:\s*0 0 0 72px/);
    expect(css).toMatch(/\.svg-edit-board\s*\{[^}]*clip-path:\s*inset\(-72px\)/);
    expect(css).toMatch(/\.svg-edit-pasteboard\s*\{[^}]*inset:\s*-72px/);
    expect(css).not.toMatch(/\.svg-edit-board\s*\{[^}]*overflow:\s*hidden/);
  });

  it("the controls round the board stay above the margin, which reaches under them", () => {
    const css = readFileSync("src/index.css", "utf8");
    const rule = /([^{}]*)\{[^}]*z-index:\s*2[^}]*\}/g;
    const lifted = Array.from(css.matchAll(rule)).map((m) => m[1]).join(" ");
    for (const part of [".svg-edit-toolbar", ".svg-edit-arrow", ".svg-edit-aside", ".svg-edit-legend"]) expect(lifted).toContain(part);
  });
});
