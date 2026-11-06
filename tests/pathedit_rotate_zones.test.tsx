// pathedit_rotate_zones.test.tsx — rotate from just outside a corner of the
// selection box (2026-11-06): near a corner, outside the box and past the
// corner's scale handle, the cursor turns into a rotate cursor and a drag
// rotates; the box's scale handles show resize cursors.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cursorAt, editorState, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";
import { rotateZoneAt } from "../src/lib/pathedit/scale";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const U = 0.1;
const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: U, target: null, ...mods });
const SQUARE = "M0 0L10 0L10 10L0 10Z";
const boxed = (): EditorState => pointerUp(pointerMove(pointerDown(editorState(newSession(fromPathData(SQUARE))), at(-2, -2)), at(12, 12)));
const BOX = { x0: 0, y0: 0, x1: 10, y1: 10 };

describe("the rotate zones", () => {
  // padded corner at (-0.8, -0.8); handle radius 0.6; zone reaches 2 (20 px) from the corner
  it("just outside a corner, past its handle, is a rotate zone", () => {
    expect(rotateZoneAt(BOX, at(-2, -2).p, { pad: 0.8, handle: 0.6, reach: 2 })).toBe("nw");
    expect(rotateZoneAt(BOX, { x: 11.9, y: 11.6 }, { pad: 0.8, handle: 0.6, reach: 2 })).toBe("se");
  });
  it("not on the handle, not inside the box, not far away", () => {
    const z = { pad: 0.8, handle: 0.6, reach: 2 };
    expect(rotateZoneAt(BOX, { x: -0.8, y: -0.8 }, z)).toBeNull();
    expect(rotateZoneAt(BOX, { x: 0.5, y: 0.5 }, z)).toBeNull();
    expect(rotateZoneAt(BOX, { x: -5, y: -5 }, z)).toBeNull();
  });
});

describe("cursors", () => {
  it("rotate in a zone, resize on the handles, nothing elsewhere or without a selection", () => {
    const st = boxed();
    expect(cursorAt(st, at(-1.8, -1.8))).toBe("rotate");
    expect(cursorAt(st, at(10.8, 10.8))).toBe("nwse-resize");
    expect(cursorAt(st, at(10.8, -0.8))).toBe("nesw-resize");
    expect(cursorAt(st, at(5, -0.8))).toBe("ns-resize");
    expect(cursorAt(st, at(10.8, 5))).toBe("ew-resize");
    expect(cursorAt(st, at(5, 5))).toBeNull();
    expect(cursorAt(editorState(newSession(fromPathData(SQUARE))), at(-1.8, -1.8))).toBeNull();
  });
});

describe("rotating from a corner zone", () => {
  it("a drag that starts in a zone rotates the selection — one undo step", () => {
    let st = boxed();
    // from just outside the top-left corner (angle -135° from the centre) to just outside the top-right (-45°): +90°
    st = pointerUp(pointerMove(pointerDown(st, at(-1.8, -1.8)), at(11.8, -1.8)));
    const pts = st.session.model.subs[0].anchors.map((a) => [Math.round(a.x) + 0, Math.round(a.y) + 0]);
    expect(pts).toEqual([[10, 0], [10, 10], [0, 10], [0, 0]]);
    expect(st.session.undo).toHaveLength(1);
  });
});

describe("in the page", () => {
  const SCALE = 10;
  const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });
  const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
    .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype).filter((p): p is object => p !== undefined);
  let host: HTMLDivElement;
  let ui: Root;
  beforeEach(() => {
    for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
    host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
  });
  afterEach(() => { act(() => ui.unmount()); host.remove(); for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM; });

  it("hovering a corner zone shows the rotate cursor; elsewhere the normal one", async () => {
    await act(async () => { ui.render(<SvgPathEditor source='<svg viewBox="0 0 24 24"><path d="M4 4L14 4L14 14L4 14Z"/></svg>' box={{ width: 240, height: 240 }} testid="e" label="i" onFinish={vi.fn()} onCancel={vi.fn()} />); });
    const node = host.querySelector("[data-testid=e]") as HTMLElement;
    const ptr = (type: string, x: number, y: number) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1 }));
    await act(async () => { ptr("pointerdown", 2, 2); ptr("pointermove", 16, 16); ptr("pointerup", 16, 16); }); // box-select all
    await act(async () => { ptr("pointermove", 2.6, 2.6); }); // just outside the top-left corner
    expect(node.style.cursor).toContain("url(");
    await act(async () => { ptr("pointermove", 9, 9); });
    expect(node.style.cursor).toBe("");
  });
});
