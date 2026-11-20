// pathedit_region_cut_ui.test.tsx — Alt + Shift over a FILLED area in the real
// edit surface (2026-11-20): the area's outline is marked red (overlay only,
// never written), the click cuts it out (see below for what "cut" means per
// fill rule), Ctrl+Z puts it back, and Finish edit writes it.
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
  const mount = (source: string = SRC) => act(async () => {
    ui.render(<SvgPathEditor source={source} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={onFinish} onCancel={vi.fn()} />);
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

// The reported bug (2026-11-20, second round): "Alt shift do select area but
// click it not apply the cut and the hole is not appear". A filled area that is
// ONE ring cannot be holed by walking it backwards, and under evenodd direction
// means nothing at all — so the cut subtracts the region instead, and the
// artboard itself (which repaints from the model) has to show it.
describe("a lone filled ring — the case that looked like a no-op", () => {
  let host: HTMLDivElement;
  let ui: Root;
  let onFinish: ReturnType<typeof vi.fn<(markup: string) => void>>;
  beforeEach(() => {
    for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
    host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
    onFinish = vi.fn<(markup: string) => void>();
  });
  afterEach(() => { act(() => ui.unmount()); host.remove(); for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM; });
  const node = () => host.querySelector("[data-testid=e]") as HTMLElement;
  const art = () => node().shadowRoot?.querySelector('[data-edit-path="0"]')?.getAttribute("d") ?? null;
  const mark = () => node().shadowRoot?.querySelector("[data-cut-region]") ?? null;
  const both = { altKey: true, shiftKey: true };
  const pointer = (type: string, x: number, y: number, mods: PointerEventInit = {}) => act(async () => {
    node().dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1, ...mods }));
  });
  const mount = (source: string) => act(async () => {
    ui.render(<SvgPathEditor source={source} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={onFinish} onCancel={vi.fn()} />);
  });
  const SQUARE = "M10 10L90 10L90 90L10 90Z";
  const cut = async () => {
    await pointer("pointermove", 50, 50, both);
    expect(mark()).not.toBeNull();
    await pointer("pointerdown", 50, 50, both);
    await pointer("pointerup", 50, 50, both);
  };

  it("the picture gets a hole: a reversed twin, and the mark goes away", async () => {
    await mount(`<svg viewBox="0 0 100 100"><path d="${SQUARE}"/></svg>`);
    expect(art()).toBe(SQUARE);
    await cut();
    expect(art()).toBe(`${SQUARE}M10 90L90 90L90 10L10 10Z`); // the same ring, walked back: it cancels
    await pointer("pointermove", 52, 52, both);
    expect(mark()).toBeNull();                                // a hole is not offered again
    await act(async () => { host.querySelector<HTMLElement>("[data-testid=e-finish]")?.click(); });
    expect(onFinish.mock.calls[0][0]).toContain(`d="${SQUARE}M10 90L90 90L90 10L10 10Z"`);
  });

  it("an evenodd outline is holed by one extra ring, same walk", async () => {
    await mount(`<svg viewBox="0 0 100 100"><path fill-rule="evenodd" d="${SQUARE}"/></svg>`);
    await cut();
    expect(art()).toBe(`${SQUARE}${SQUARE}`);
    await act(async () => { host.querySelector<HTMLElement>("[data-testid=e-finish]")?.click(); });
    const written = onFinish.mock.calls[0][0];
    expect(written).toContain('fill-rule="evenodd"'); // the rule that makes it a hole is kept
    expect(written).toContain(`d="${SQUARE}${SQUARE}"`);
  });

  it("an evenodd area that is already a hole is not marked", async () => {
    await mount(`<svg viewBox="0 0 100 100"><path fill-rule="evenodd" d="${SQUARE}M40 40L60 40L60 60L40 60Z"/></svg>`);
    await pointer("pointermove", 50, 50, both);
    expect(mark()).toBeNull();
    await pointer("pointermove", 20, 20, both); // between the rings the fill still paints
    expect(mark()).not.toBeNull();
  });
});

// The user's map pin (2026-11-20, third round): the middle circle is a closed
// ring of a `fill="none"` stroked path, so it paints nothing — it never became a
// region ("circle in middle never selected for cut with red") and the pin could
// not be holed. It is the CUTTER now: the mark is the circle, and the click adds
// that ring to the FILLED path, so the pin gets its hole and the other path is
// left byte for byte.
const PIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 384">`
  + `<path fill="#28ACEE" d="M65 168c0-27 15-59 36-76 22-17 50-21 73-18 28 2 52 14 65 34 14 23 19 45 10 71-8 25-20 46-34 66l-37 60-5 7q-5 7-10 0l-6-5-67-77q-25-29-25-62zM208 65c10-14 29-21 44-23 28-4 53 6 66 26 15 23 16 57 0 85-17 25-34 41-56 66q-7 7-12-1l-3-6q-1-3 1-7c13-28 17-49 10-76-7-24-23-42-48-54q-7-4-2-10z"/>`
  + `<path fill="none" stroke="#000" stroke-width="5.4" stroke-linecap="round" d="M151.58 122.6C131.58 129.6 114.58 150.6 118.58 173.6C121.58 195.6 143.58 209.6 165.58 206.6C188.58 203.6 206.58 179.6 204.58 156.6C201.58 129.6 175.58 114.6 151.58 122.6Z"/>`
  + `</svg>`;

describe("the map pin — a stroked circle is the cutter", () => {
  let host: HTMLDivElement;
  let ui: Root;
  let onFinish: ReturnType<typeof vi.fn<(markup: string) => void>>;
  beforeEach(() => {
    for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
    host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
    onFinish = vi.fn<(markup: string) => void>();
  });
  afterEach(() => { act(() => ui.unmount()); host.remove(); for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM; });
  const node = () => host.querySelector("[data-testid=e]") as HTMLElement;
  const art = (i: number) => node().shadowRoot?.querySelector(`[data-edit-path="${i}"]`)?.getAttribute("d") ?? null;
  const mark = () => node().shadowRoot?.querySelector("[data-cut-region]") ?? null;
  /** How many rings a `d` draws. */
  const rings = (d: string | null) => (d ?? "").split("M").length - 1;
  const both = { altKey: true, shiftKey: true };
  const pointer = (type: string, x: number, y: number, mods: PointerEventInit = {}) => act(async () => {
    node().dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1, ...mods }));
  });

  it("marks the middle circle and cuts the hole out of the pin's own path", async () => {
    await act(async () => {
      ui.render(<SvgPathEditor source={PIN} box={{ width: 384, height: 384 }} testid="e" label="pin" onFinish={onFinish} onCancel={vi.fn()} />);
    });
    const circleBefore = art(1);
    const pinBefore = art(0);
    await pointer("pointermove", 161, 165, both);
    expect(mark()).not.toBeNull();                                  // the circle is marked…
    const marked = mark()?.getAttribute("d") ?? "";
    expect(marked.startsWith("M151.58 122.6")).toBe(true);          // …it is the circle's outline (flattened)
    expect(marked.trim().endsWith("Z")).toBe(true);
    await pointer("pointerdown", 161, 165, both);
    await pointer("pointerup", 161, 165, both);
    expect(art(1)).toBe(circleBefore);                               // the stroked path is untouched…
    expect(rings(art(0))).toBe(rings(pinBefore) + 1);                // …the pin's path gained the ring
    await pointer("pointermove", 165, 168, both);
    expect(mark()).toBeNull();                                       // nothing left to cut there
    await act(async () => { host.querySelector<HTMLElement>("[data-testid=e-finish]")?.click(); });
    const written = onFinish.mock.calls[0][0];
    const pinTag = written.slice(written.indexOf('fill="#28ACEE"'), written.indexOf('fill="none"'));
    expect(rings(pinTag)).toBe(3);                                   // body, fold, and the hole
    expect(pinTag).toContain("151.58");                               // the hole sits on the circle
    expect(written).toContain('stroke-width="5.4"');                 // the stroke keeps its look
    expect(written).toContain(`d="${circleBefore}"`);                 // the stroked path keeps its `d`
  });

  it("a second cut never paints an earlier hole back", async () => {
    await act(async () => {
      ui.render(<SvgPathEditor source={PIN} box={{ width: 384, height: 384 }} testid="e" label="pin" onFinish={onFinish} onCancel={vi.fn()} />);
    });
    await pointer("pointermove", 161, 165, both);
    await pointer("pointerdown", 161, 165, both);
    await pointer("pointerup", 161, 165, both);
    expect(rings(art(0))).toBe(3);                    // body, fold, the hole
    await pointer("pointermove", 161, 165, both);
    expect(mark()).toBeNull();                        // the hole is not offered again
    // The whole pin body next: it CONTAINS that hole. The hole has to stay a
    // hole — the bigger ring must not paint it back (the reported bug).
    await pointer("pointermove", 150, 80, both);
    expect(mark()).not.toBeNull();
    const before = rings(art(0));
    await pointer("pointerdown", 150, 80, both);
    await pointer("pointerup", 150, 80, both);
    expect(rings(art(0))).toBe(before);               // the old hole copy dropped, the body copy added
    expect(art(0)).not.toContain("151.58");           // …and that hole copy is the one that went
    await pointer("pointermove", 161, 165, both);
    expect(mark()).toBeNull();                        // the old hole is STILL a hole
    await act(async () => { host.querySelector<HTMLElement>("[data-testid=e-finish]")?.click(); });
    expect(onFinish.mock.calls[0][0]).toContain("151.58"); // the stroked circle keeps its d
  });

  it("the middle of the pin body itself is still a region", async () => {
    await act(async () => {
      ui.render(<SvgPathEditor source={PIN} box={{ width: 384, height: 384 }} testid="e" label="pin" onFinish={onFinish} onCancel={vi.fn()} />);
    });
    await pointer("pointermove", 150, 80, both); // inside the pin body, outside the circle and the fold
    expect(mark()).not.toBeNull();
    expect(mark()?.getAttribute("d")).not.toBe(art(1)); // the pin body is the ring, not the circle
  });
});
