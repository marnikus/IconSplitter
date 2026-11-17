// pathedit_live_shapes.test.tsx — two reported edit-mode bugs (2026-11-06):
// 1. dragging a circle's anchors moved the anchors but the circle stayed: the
//    live preview set `d` on a <circle>, which ignores it. A changed basic
//    shape is now shown as the <path> Finish will write.
// 2. in preset (thick) stroke mode a thin guide line was drawn over the thick
//    stroke: only the thick stroke and the anchors are shown now.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCALE = 10;
const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });
const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement", "SVGCircleElement"]
  .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype).filter((p): p is object => p !== undefined);

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => {
  for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
  host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
});
afterEach(() => { act(() => ui.unmount()); host.remove(); for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM; });

const SRC = '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="4" stroke="#000" stroke-width="2"/></svg>';
const shadow = () => (host.querySelector("[data-testid=e]") as HTMLElement).shadowRoot as ShadowRoot;
const pointer = (t: EventTarget, type: string, x: number, y: number) =>
  t.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1 }));
const mount = () => act(async () => { ui.render(<SvgPathEditor source={SRC} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={vi.fn()} onCancel={vi.fn()} />); });

describe("a moved circle is drawn where its anchors are", () => {
  it("the changed circle is shown as a path following the drag, its attributes kept", async () => {
    await mount();
    const node = host.querySelector("[data-testid=e]") as HTMLElement;
    await act(async () => { pointer(node, "pointerdown", 14, 10); pointer(node, "pointermove", 18, 10); pointer(node, "pointerup", 18, 10); });
    const shape = shadow().querySelector("[data-edit-path='0']") as Element;
    expect(shape.tagName.toLowerCase()).toBe("path");
    expect(shape.getAttribute("d")).toMatch(/^M18 10C/);
    expect(shape.getAttribute("stroke-width")).toBe("2");
    expect(shape.hasAttribute("cx")).toBe(false);
    const artCircles = [...shadow().querySelectorAll("circle")].filter((c) => c.closest("[data-edit-overlay]") === null);
    expect(artCircles).toHaveLength(0);
  });

  it("an untouched circle stays a circle", async () => {
    await mount();
    expect(shadow().querySelector("[data-edit-path='0']")?.tagName.toLowerCase()).toBe("circle");
  });
});

describe("preset stroke mode shows the thick stroke and anchors only", () => {
  it("no thin guide line over the artwork in preset mode; the thin view keeps it", async () => {
    await mount();
    const overlayPaths = () => shadow().querySelectorAll("[data-edit-overlay] path").length;
    expect(overlayPaths()).toBe(0);
    await act(async () => { (host.querySelector("[data-testid=e-stroke]") as HTMLButtonElement).click(); });
    expect(overlayPaths()).toBe(1);
  });
});
