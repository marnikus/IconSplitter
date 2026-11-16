// pathedit_rotate.test.ts — rotating the selected points in the edit mode
// (2026-11-06): the scale box gets a rotate handle (a circle on a short stem
// above the top edge). Dragging it turns the selected points (and their curve
// handles) around the box's centre; Shift snaps the angle to 15° steps; one
// drag = one undo step.
import { describe, expect, it } from "vitest";
import { editorState, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";
import { rotateAnchors, rotateAngle, rotateHandleOf } from "../src/lib/pathedit/scale";
import { drawEditOverlay } from "../src/svg/pathedit/editoroverlay";

const U = 0.1;
const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: U, target: null, ...mods });
const SQUARE = "M0 0L10 0L10 10L0 10Z";
const boxed = (): EditorState => pointerUp(pointerMove(pointerDown(editorState(newSession(fromPathData(SQUARE))), at(-2, -2)), at(12, 12)));
const r2 = (v: number) => Math.round(v * 100) / 100 + 0; // + 0 turns -0 into 0
const round = (st: EditorState) => st.session.model.subs[0].anchors.map((a) => [r2(a.x), r2(a.y)]);

describe("the math", () => {
  it("the rotate handle sits above the top-middle handle", () => {
    expect(rotateHandleOf({ x0: 0, y0: 0, x1: 10, y1: 10 }, 0.8, 2.4)).toEqual({ x: 5, y: -3.2 });
  });

  it("points and their handles turn around a centre", () => {
    const m = fromPathData("M10 5C10 8 8 10 5 10");
    const out = rotateAnchors(m, [{ sub: 0, i: 0 }, { sub: 0, i: 1 }], { x: 5, y: 5 }, Math.PI / 2);
    const [a, b] = out.subs[0].anchors;
    expect([Math.round(a.x), Math.round(a.y)]).toEqual([5, 10]);
    expect([Math.round(b.x), Math.round(b.y)]).toEqual([0, 5]);
    expect(a.out && [Math.round(a.out.x), Math.round(a.out.y)]).toEqual([2, 10]);
  });

  it("the angle from the drag, snapped to 15° with Shift", () => {
    const c = { x: 0, y: 0 };
    expect(rotateAngle(c, { x: 0, y: -10 }, { x: 10, y: 0 }, false)).toBeCloseTo(Math.PI / 2);
    expect(rotateAngle(c, { x: 0, y: -10 }, { x: 10, y: -1 }, true)).toBeCloseTo(Math.PI / 2);
    expect(rotateAngle(c, { x: 0, y: -10 }, { x: 3, y: -10 }, true)).toBeCloseTo(Math.PI / 12);
  });
});

describe("in the edit mode", () => {
  it("dragging the rotate handle a quarter turn turns the square around its centre — one undo step", () => {
    let st = boxed();
    // the handle: 8 px (0.8) above the box, then a 24 px (2.4) stem → (5, -3.2); drag it to the right of the centre
    st = pointerUp(pointerMove(pointerDown(st, at(5, -3.2)), at(13.2, 5)));
    expect(round(st)).toEqual([[10, 0], [10, 10], [0, 10], [0, 0]]);
    expect(st.session.undo).toHaveLength(1);
  });

  it("with Shift a near-quarter turn snaps to exactly 90°", () => {
    let st = boxed();
    st = pointerUp(pointerMove(pointerDown(st, at(5, -3.2, { shift: true })), at(13.2, 4.2, { shift: true })));
    expect(round(st)).toEqual([[10, 0], [10, 10], [0, 10], [0, 0]]);
  });

  it("the overlay draws the rotate handle and its stem with the box", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawEditOverlay(svg, boxed(), { u: U, anchorPx: 10 });
    expect(svg.querySelectorAll("[data-rotate-handle]")).toHaveLength(1);
    expect(svg.querySelectorAll("[data-rotate-stem]")).toHaveLength(1);
  });
});
