// svg_anchors.test.tsx — anchor points on the SVG preview (2026-11-05): hover
// a preview while holding Ctrl and every node of the drawing shows as a small
// hollow circle, as in an editor; let go of Ctrl or leave the preview and they
// vanish. The points are the shapes' real nodes (each path segment's end, not
// the arc pieces an exporter would split into), in the SVG's own coordinates,
// with every group/element transform applied.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { anchorPointsOf, pathAnchors } from "../src/lib/svganchors";
import SvgPreviewBox from "../src/svg/SvgPreview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pts = (list: { x: number; y: number }[]) => list.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);

describe("pathAnchors — one node per segment end", () => {
  it("follows absolute and relative commands, H/V, curves, arcs and Z", () => {
    expect(pts(pathAnchors("M10 10 L20 10 H30 V20 l-5 5 h-5 v5 Z"))).toEqual([[10, 10], [20, 10], [30, 10], [30, 20], [25, 25], [20, 25], [20, 30]]);
    expect(pts(pathAnchors("M0 0 C1 1 2 2 3 3 S5 5 6 6 Q7 7 8 8 T10 10 A5 5 0 0 1 20 10"))).toEqual([[0, 0], [3, 3], [6, 6], [8, 8], [10, 10], [20, 10]]);
    expect(pts(pathAnchors("m1 1 2 0 0 2z m10 10 1 0"))).toEqual([[1, 1], [3, 1], [3, 3], [11, 11], [12, 11]]);
  });

  it("does not repeat the start when Z closes onto it, and reads an empty path as none", () => {
    expect(pts(pathAnchors("M0 0 L10 0 L0 0 Z"))).toEqual([[0, 0], [10, 0]]);
    expect(pathAnchors("")).toEqual([]);
  });
});

describe("anchorPointsOf — every drawn shape, in the SVG's own space", () => {
  it("reads lines, polylines, rects and circles, and the viewBox size", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <line x1="1" y1="2" x2="3" y2="4"/><polyline points="5,5 6,6 7,7"/>
      <rect x="10" y="10" width="5" height="4"/><circle cx="50" cy="20" r="3"/></svg>`;
    const out = anchorPointsOf(svg);
    expect(out.size).toBe(100);
    expect(pts(out.points)).toEqual([[1, 2], [3, 4], [5, 5], [6, 6], [7, 7], [10, 10], [15, 10], [15, 14], [10, 14], [53, 20], [50, 23], [47, 20], [50, 17]]);
  });

  it("applies nested group and element transforms", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g transform="translate(10 0)"><path transform="scale(2)" d="M1 1 L2 1"/></g></svg>`;
    expect(pts(anchorPointsOf(svg).points)).toEqual([[12, 2], [14, 2]]);
  });

  it("skips what is never drawn directly (defs, clip paths, masks, symbols)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><path d="M0 0 L1 1"/></defs>
      <clipPath><rect width="1" height="1"/></clipPath><path d="M5 5 L6 6"/></svg>`;
    expect(pts(anchorPointsOf(svg).points)).toEqual([[5, 5], [6, 6]]);
  });

  it("returns nothing for code that is not an SVG", () => {
    expect(anchorPointsOf("<svg><broken").points).toEqual([]);
  });
});

let host: HTMLDivElement;
let ui: Root;
const CODE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 L90 10 L90 90" fill="none" stroke="#000"/></svg>';
const overlay = () => (host.querySelector("[data-testid=prev]") as HTMLElement).shadowRoot?.querySelector("[data-anchor-overlay]") ?? null;

describe("the preview shows its anchors while Ctrl is held over it", () => {
  beforeEach(async () => {
    host = document.createElement("div");
    document.body.append(host);
    ui = createRoot(host);
    await act(async () => { ui.render(<SvgPreviewBox code={CODE} box={{ width: 100, height: 100 }} testid="prev" label="x" version={1} />); });
  });
  afterEach(() => { act(() => ui.unmount()); host.remove(); });

  const frame = () => host.querySelector("[data-testid=prev]") as HTMLElement;
  const key = (type: "keydown" | "keyup") => act(async () => { window.dispatchEvent(new KeyboardEvent(type, { key: "Control", ctrlKey: type === "keydown" })); });

  it("draws one hollow circle per node with Ctrl over the preview, and clears on release", async () => {
    await act(async () => { frame().dispatchEvent(new PointerEvent("pointerenter")); });
    expect(overlay()).toBeNull(); // hovering alone shows nothing
    await key("keydown");
    const circles = overlay()?.querySelectorAll("circle") ?? [];
    expect(circles).toHaveLength(3);
    expect(circles[0].getAttribute("cx")).toBe("10");
    expect(circles[0].getAttribute("style")).toContain("!important"); // wins over the preview stroke sheet
    await key("keyup");
    expect(overlay()).toBeNull();
  });

  it("clears when the pointer leaves, even with Ctrl still held", async () => {
    await act(async () => { frame().dispatchEvent(new PointerEvent("pointerenter", { ctrlKey: true })); });
    expect(overlay()).not.toBeNull(); // Ctrl already held when the pointer arrives
    await act(async () => { frame().dispatchEvent(new PointerEvent("pointerleave", { ctrlKey: true })); });
    expect(overlay()).toBeNull();
  });
});
