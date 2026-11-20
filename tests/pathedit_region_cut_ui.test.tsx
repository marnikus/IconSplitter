// pathedit_region_cut_ui.test.tsx — Alt + Shift over a FILLED area in the real
// edit surface (2026-11-20): the area's outline is marked red (overlay only,
// never written), the click cuts it out — the working path keeps its geometry
// and walks the other way — Ctrl+Z puts it back, and Finish edit writes it.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = '<svg viewBox="0 0 100 100"><path d="M10 10L90 10L90 90L10 90ZM40 40L60 40L60 60L40 60Z"/></svg>';
const SCALE = 10;
const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });
const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
  .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype).filter((p): p is object => p !== undefined);

describe("Alt + Shift over a filled area", () => {
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
  const node = () => q("[data-testid=e]") as HTMLElement;
  const mark = () => node().shadowRoot?.querySelector("[data-cut-region]") ?? null;
  const pointer = (type: string, x: number, y: number, mods: PointerEventInit = {}) => act(async () => {
    node().dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1, ...mods }));
  });
  const both = { altKey: true, shiftKey: true };
  const mount = () => act(async () => {
    ui.render(<SvgPathEditor source={SRC} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={onFinish} onCancel={vi.fn()} />);
  });

  it("marks the fill red while both keys are held, and clears it otherwise", async () => {
    await mount();
    await pointer("pointermove", 50, 50);
    expect(mark()).toBeNull();
    await pointer("pointermove", 50, 50, both);
    expect(mark()).not.toBeNull();
    expect(mark()?.getAttribute("d")).toBe("M40 40L60 40L60 60L40 60Z"); // the inner ring's own outline
    expect(mark()?.getAttribute("style")).toContain("stroke:#ff0000");
    await pointer("pointermove", 50, 50);
    expect(mark()).toBeNull();
  });

  it("the click cuts the area out, Ctrl+Z restores it, Finish edit writes it", async () => {
    await mount();
    await pointer("pointermove", 50, 50, both);
    await pointer("pointerdown", 50, 50, both);
    await pointer("pointerup", 50, 50, both);
    expect(mark()).toBeNull();
    await act(async () => { q("[data-testid=e-finish]")?.click(); });
    const written = onFinish.mock.calls[0][0];
    expect(written).toContain('d="M10 10L90 10L90 90L10 90ZM40 60L60 60L60 40L40 40Z"');
    expect(written).not.toContain("data-cut-region");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })); });
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(true);
  });

  it("is in the legend", async () => {
    await mount();
    expect(q("[data-testid=e-legend]")?.textContent).toContain("Alt+Shift+Click fill");
  });
});
