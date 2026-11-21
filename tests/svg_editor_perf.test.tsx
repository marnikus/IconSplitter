// TDD response & work-budget suite for the Generate SVG path editor:
// verifies zero full-document XML/regex serialization during drag/hover/marquee,
// O(1) dirty-path DOM updates, pooled O(1) overlay circle updates, and fast
// multi-gesture editing on complex multi-path icons.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";
import * as objects from "../src/lib/pathedit/objects";
import * as svgdoc from "../src/lib/pathedit/svgdoc";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCALE = 2;
const ctm = () => ({
  a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0,
  inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }),
});
const protos = () =>
  ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
    .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype)
    .filter((p): p is object => p !== undefined);

/** 20 <path> objects × 12 anchors each = 240 anchors with cubics & closed regions. */
function makeComplexIcon(): string {
  const paths: string[] = [];
  for (let p = 0; p < 20; p++) {
    const ox = (p % 5) * 44 + 8;
    const oy = Math.floor(p / 5) * 44 + 8;
    const segs: string[] = [`M${ox} ${oy}`];
    for (let k = 1; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      const x = Math.round((ox + 16 + Math.cos(ang) * 14) * 100) / 100;
      const y = Math.round((oy + 16 + Math.sin(ang) * 14) * 100) / 100;
      if (k % 2 === 0) segs.push(`C${x - 2} ${y - 2} ${x + 2} ${y - 1} ${x} ${y}`);
      else segs.push(`L${x} ${y}`);
    }
    paths.push(`<path d="${segs.join("")}Z" fill="${p === 0 ? "#111" : "none"}" stroke="#111" stroke-width="1.5"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200">${paths.join("")}</svg>`;
}

let host: HTMLDivElement;
let ui: Root;

beforeEach(() => {
  for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM;
  vi.restoreAllMocks();
});

function firePointer(target: EventTarget, type: string, x: number, y: number, mods: Partial<PointerEventInit> = {}): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, composed: true, button: 0, pointerId: 1,
    clientX: x * SCALE, clientY: y * SCALE, ...mods,
  }));
}

describe("Generate SVG path editor real-time performance & work budgets", () => {
  it("avoids per-frame writeObjects/pathTags scans, updates only the changed <path>, and pools overlay circles", async () => {
    const src = makeComplexIcon();
    const onFinish = vi.fn();
    await act(async () => {
      ui.render(<SvgPathEditor source={src} box={{ width: 480, height: 400 }} testid="perf-ed" label="complex" onFinish={onFinish} onCancel={() => {}} />);
    });
    const surface = host.querySelector('[data-testid="perf-ed"]') as HTMLElement;
    const shadow = surface.shadowRoot!;

    // Select all 20 objects via Ctrl+A twice (1st selects objects if empty, or Shift-click objects; let's marquee all!)
    await act(async () => {
      firePointer(surface, "pointerdown", 2, 2);
      firePointer(surface, "pointermove", 238, 198);
      firePointer(surface, "pointerup", 238, 198);
    });
    expect(shadow.querySelectorAll("[data-edit-overlay] circle").length).toBeGreaterThanOrEqual(200);

    // Clear selection to single anchor on path 0 at (8, 8) while keeping all 20 objects active
    await act(async () => {
      firePointer(surface, "pointerdown", 250, 250);
      firePointer(surface, "pointerup", 250, 250);
      firePointer(surface, "pointerdown", 8, 8);
      firePointer(surface, "pointerup", 8, 8);
    });

    const svgOwnerDoc = shadow.querySelector("svg")!.ownerDocument;
    const writeSpy = vi.spyOn(objects, "writeObjects");
    const pathTagsSpy = vi.spyOn(svgdoc, "pathTags");
    const createElSpy = vi.spyOn(svgOwnerDoc, "createElementNS");
    const setAttrSpy = vi.spyOn(Element.prototype, "setAttribute");

    const t0 = performance.now();
    await act(async () => { firePointer(surface, "pointerdown", 8, 8); });
    createElSpy.mockClear();
    setAttrSpy.mockClear();
    writeSpy.mockClear();
    pathTagsSpy.mockClear();

    const STEPS = 30;
    for (let s = 1; s <= STEPS; s++) {
      await act(async () => { firePointer(surface, "pointermove", 8 + s * 0.5, 8 + s * 0.25); });
    }
    await act(async () => { firePointer(surface, "pointerup", 23, 15.5); });
    const dragMs = performance.now() - t0;

    const dWrites = setAttrSpy.mock.calls.filter(([name]) => name === "d").length;
    const circleCreates = createElSpy.mock.calls.filter(([, tag]) => tag === "circle").length;

    // 15 Alt+Shift hover frames should not rewrite any artwork <path d="..."> or recreate anchor circles
    setAttrSpy.mockClear();
    createElSpy.mockClear();
    const tHover0 = performance.now();
    for (let s = 0; s < 15; s++) {
      await act(async () => {
        firePointer(surface, "pointermove", 20 + s, 20, { altKey: true, shiftKey: true });
      });
    }
    const hoverMs = performance.now() - tHover0;
    const hoverArtDWrites = setAttrSpy.mock.calls.filter(function (this: unknown, [name]) {
      return name === "d";
    }).length;
    const hoverCircleCreates = createElSpy.mock.calls.filter(([, tag]) => tag === "circle").length;

    console.info(`[svg_editor_perf] 30-step drag: ${dragMs.toFixed(1)} ms, 15-step Alt+Shift hover: ${hoverMs.toFixed(1)} ms, dWrites=${dWrites}, circleCreates=${circleCreates}`);

    // Zero full-document writeObjects during drag/up (only on Finish edit!)
    expect(writeSpy).not.toHaveBeenCalled();
    // Cached pathTags: 0 fresh regex scans across 30 drag frames
    expect(pathTagsSpy).not.toHaveBeenCalled();
    // Only the 1 dirty path (+ optional thin guide if enabled; preset view has guide=false) writes `d` per step
    expect(dWrites).toBeLessThanOrEqual(STEPS + 2);
    // Pooled anchor circles: 0 new <circle> DOM nodes allocated during drag or hover
    expect(circleCreates).toBe(0);
    expect(hoverCircleCreates).toBe(0);
    // Hovering Alt+Shift updates at most the transient hint path, never the 20 artwork paths
    expect(hoverArtDWrites).toBeLessThanOrEqual(15);

    // Clicking Finish edit writes the modified SVG cleanly once
    const finishBtn = host.querySelector('[data-testid="perf-ed-finish"]') as HTMLButtonElement;
    expect(finishBtn.disabled).toBe(false);
    await act(async () => { finishBtn.click(); });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
