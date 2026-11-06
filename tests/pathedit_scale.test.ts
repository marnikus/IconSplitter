// pathedit_scale.test.ts — scaling selected anchors in the edit mode
// (2026-11-06): with two or more anchors selected a bounding box with eight
// handles appears (a little outside the anchors, so it never hides one). A
// corner scales width and height freely (squeeze or stretch), Shift keeps the
// proportions; an edge scales one direction (Shift: both, evenly). The pivot is
// the opposite side; curve handles scale with their anchors; one drag = one
// undo step.
import { describe, expect, it } from "vitest";
import { editorState, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";
import { boxHandles, scaleAnchors, scaleFor, selectionBox } from "../src/lib/pathedit/scale";
import { drawEditOverlay } from "../src/svg/pathedit/editoroverlay";

const U = 0.1; // path units per screen pixel
const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: U, target: null, ...mods });
const SQUARE = "M0 0L10 0L10 10L0 10Z";
const boxSelected = (d = SQUARE): EditorState => {
  const st = editorState(newSession(fromPathData(d)));
  return pointerUp(pointerMove(pointerDown(st, at(-2, -2)), at(12, 12)));
};
const drag = (st: EditorState, a: PointerInput, b: PointerInput) => pointerUp(pointerMove(pointerDown(st, a), b));

describe("the math", () => {
  it("the box of the selected anchors and its eight handles, padded outward", () => {
    const m = fromPathData(SQUARE);
    const refs = [0, 1, 2, 3].map((i) => ({ sub: 0, i }));
    expect(selectionBox(m, refs)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 });
    const h = boxHandles({ x0: 0, y0: 0, x1: 10, y1: 10 }, 1);
    expect(h).toHaveLength(8);
    expect(h.find((x) => x.id === "se")?.p).toEqual({ x: 11, y: 11 });
    expect(h.find((x) => x.id === "n")?.p).toEqual({ x: 5, y: -1 });
  });

  it("corner = free scale about the opposite corner; Shift = proportional; edge = one axis", () => {
    const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(scaleFor("se", box, { dx: 10, dy: 0 }, false)).toEqual({ origin: { x: 0, y: 0 }, sx: 2, sy: 1 });
    expect(scaleFor("se", box, { dx: 10, dy: 0 }, true)).toEqual({ origin: { x: 0, y: 0 }, sx: 2, sy: 2 });
    expect(scaleFor("w", box, { dx: 5, dy: 9 }, false)).toEqual({ origin: { x: 10, y: 0 }, sx: 0.5, sy: 1 });
    expect(scaleFor("n", box, { dx: 0, dy: -10 }, true)).toEqual({ origin: { x: 5, y: 10 }, sx: 2, sy: 2 });
  });

  it("anchors and their handles scale together", () => {
    const m = fromPathData("M0 0C0 5 5 10 10 10");
    const out = scaleAnchors(m, [{ sub: 0, i: 0 }, { sub: 0, i: 1 }], { origin: { x: 0, y: 0 }, sx: 2, sy: 1 });
    expect(toPathData(out)).toBe("M0 0C0 5 10 10 20 10");
  });
});

describe("in the edit mode", () => {
  it("dragging the bottom-right handle stretches the selection freely — one undo step", () => {
    const st = drag(boxSelected(), at(10.8, 10.8), at(20.8, 10.8)); // the se handle sits 8 px (0.8) outside
    expect(toPathData(st.session.model)).toBe("M0 0L20 0L20 10L0 10Z");
    expect(st.session.undo).toHaveLength(1);
  });

  it("with Shift the proportions are kept", () => {
    const st = drag(boxSelected(), at(10.8, 10.8, { shift: true }), at(20.8, 10.8, { shift: true }));
    expect(toPathData(st.session.model)).toBe("M0 0L20 0L20 20L0 20Z");
  });

  it("an edge handle squeezes one direction only", () => {
    const st = drag(boxSelected(), at(5, -0.8), at(5, 4.2)); // the n handle, pulled down half way
    expect(toPathData(st.session.model)).toBe("M0 5L10 5L10 10L0 10Z");
  });

  it("no box with a single anchor selected: a press there is a normal click", () => {
    let st = editorState(newSession(fromPathData(SQUARE)));
    st = pointerUp(pointerDown(st, at(10, 10)));
    st = drag(st, at(10.8, 10.8), at(20.8, 10.8));
    expect(toPathData(st.session.model)).toBe(SQUARE);
  });

  it("the overlay draws the box and its eight handles while two or more anchors are selected", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawEditOverlay(svg, boxSelected(), { u: U, anchorPx: 10 });
    expect(svg.querySelectorAll("[data-scale-box]")).toHaveLength(1);
    expect(svg.querySelectorAll("[data-scale-handle]")).toHaveLength(8);
  });
});
