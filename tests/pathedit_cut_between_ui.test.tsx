// pathedit_cut_between_ui.test.tsx — Alt + Shift + click in the edit surface
// (2026-11-09): over a line the two keys show, in red, the part between its two
// crossings; the click removes it (anchors appear on the crossings), Ctrl+Z
// brings it back, Finish edit writes the result. The red hint is overlay only.
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

describe("Alt + Shift + click in the edit surface", () => {
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
  const hint = () => node().shadowRoot?.querySelector("[data-cut-hint]") ?? null;
  const pointer = (type: string, x: number, y: number, mods: PointerEventInit = {}) => act(async () => {
    node().dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1, ...mods }));
  });
  const both = { altKey: true, shiftKey: true };
  const mount = () => act(async () => {
    ui.render(<SvgPathEditor source={SRC} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={onFinish} onCancel={vi.fn()} />);
  });
  const select = async () => { await pointer("pointerdown", 50, 50); await pointer("pointerup", 50, 50); };

  it("shows the part to remove in red while both keys are held, and hides it otherwise", async () => {
    await mount();
    await select();
    await pointer("pointermove", 50, 50);
    expect(hint()).toBeNull();
    await pointer("pointermove", 50, 50, both);
    expect(hint()).not.toBeNull();
    expect(hint()?.getAttribute("d")).toMatch(/^M30 50L/);
    expect(hint()?.getAttribute("style")).toContain("stroke:#ff0000");
    await pointer("pointermove", 50, 50);
    expect(hint()).toBeNull();
  });

  it("the click removes it, Ctrl+Z restores it, and Finish edit writes the cut line", async () => {
    await mount();
    await select();
    await pointer("pointermove", 50, 50, both);
    await pointer("pointerdown", 50, 50, both);
    await pointer("pointerup", 50, 50, both);
    expect(hint()).toBeNull();
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(false);
    await act(async () => { q("[data-testid=e-finish]")?.click(); });
    const written = onFinish.mock.calls[0][0];
    expect(written).toContain('d="M0 50L30 50M70 50L100 50"');
    expect(written).not.toContain("data-cut-hint");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })); });
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(true);
  });

  it("is in the legend", async () => {
    await mount();
    expect(q("[data-testid=e-legend]")?.textContent).toContain("Alt+Shift+Click line");
  });
});
