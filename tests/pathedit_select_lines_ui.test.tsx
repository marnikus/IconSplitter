// pathedit_select_lines_ui.test.tsx — Ctrl + A and the double-click modifiers in
// the real edit surface (2026-11-10): the browser's own select-all never runs,
// every object is selected, and an Alt + double-click (two Alt presses and the
// dblclick event) excludes the line and leaves the artwork untouched.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = '<svg viewBox="0 0 100 100"><path d="M0 50L100 50"/><path d="M30 0L30 100"/><path d="M70 0L70 100"/></svg>';
const SCALE = 10;
const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });
const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
  .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype).filter((p): p is object => p !== undefined);

describe("selecting everything and whole lines in the edit surface", () => {
  let host: HTMLDivElement;
  let ui: Root;
  beforeEach(() => {
    for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
    host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
  });
  afterEach(() => { act(() => ui.unmount()); host.remove(); for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM; });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const node = () => q("[data-testid=e]") as HTMLElement;
  const shadow = () => node().shadowRoot as ShadowRoot;
  const pointer = (type: string, x: number, y: number, mods: PointerEventInit = {}) => act(async () => {
    node().dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1, ...mods }));
  });
  const dbl = (x: number, y: number, mods: MouseEventInit = {}) => act(async () => {
    node().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true, clientX: x * SCALE, clientY: y * SCALE, ...mods }));
  });
  const mount = () => act(async () => { ui.render(<SvgPathEditor source={SRC} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={vi.fn()} onCancel={vi.fn()} />); });
  const key = async (init: KeyboardEventInit) => {
    const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    await act(async () => { window.dispatchEvent(e); });
    return e;
  };
  const finishOff = () => q("[data-testid=e-finish]")?.hasAttribute("disabled");
  const box = () => shadow().querySelector("[data-scale-box]");

  it("Ctrl + A selects all objects on the artboard (the box appears) and stops the browser's select-all", async () => {
    await mount();
    expect(box()).toBeNull();
    const e = await key({ key: "a", ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(box()).not.toBeNull();
    expect(finishOff()).toBe(true); // selecting is not an edit
  });

  it("Ctrl + A is listed in the legend with the double-click modifiers", async () => {
    await mount();
    const legend = q("[data-testid=e-legend]")?.textContent ?? "";
    for (const k of ["Ctrl+A", "Shift+Double-click", "Alt+Double-click"]) expect(legend).toContain(k);
  });

  it("an Alt + double-click on a line excludes it and removes nothing", async () => {
    await mount();
    await pointer("pointerdown", 50, 50); await pointer("pointerup", 50, 50); // picks the long line
    await key({ key: "a", ctrlKey: true });
    const alt = { altKey: true };
    await pointer("pointerdown", 50, 50, alt); await pointer("pointerup", 50, 50, alt);
    await pointer("pointerdown", 50, 50, alt); await pointer("pointerup", 50, 50, alt);
    await dbl(50, 50, alt);
    expect(finishOff()).toBe(true); // the artwork is as it was: no segment was removed
    expect(box()).not.toBeNull(); // the two vertical lines are still selected
  });
});
