// pathedit_skew.test.ts — skewing a group selection by ANGLE from one edge of
// its bounding box, the Photoshop way (2026-11-09). Dragging a box edge (not its
// handles, not the corner rotate zones) along that edge skews the selected
// points about the CENTRE of the box: the dragged edge follows the pointer, the
// opposite edge moves the other way, and the amount is an angle — tan(angle) =
// pointer travel ÷ the edge's distance from the centre — shown as a readout
// ("⊿ : -11.6°") next to the pointer together with the centre mark and the
// skewed box. Shift snaps to 15° steps. The cursor over an edge is a double
// arrow PARALLEL to it. Handles skew with their anchors; one drag = one undo step.
import { describe, expect, it } from "vitest";
import { cursorAt, editorState, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";
import { skewAngleFor, skewAnchors } from "../src/lib/pathedit/skew";
import { boxTargetAt } from "../src/lib/pathedit/boxtarget";
import { drawEditOverlay } from "../src/svg/pathedit/editoroverlay";
import { EDIT_HOTKEYS } from "../src/svg/pathedit/hotkeys";

const U = 0.1; // path units per screen pixel; the padded box is 0.8 units outside the anchors
const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: U, target: null, ...mods });
const SQUARE = "M0 0L10 0L10 10L0 10Z";
const boxSelected = (d = SQUARE): EditorState => {
  const st = editorState(newSession(fromPathData(d)));
  return pointerUp(pointerMove(pointerDown(st, at(-2, -2)), at(12, 12)));
};
const drag = (st: EditorState, a: PointerInput, b: PointerInput) => pointerUp(pointerMove(pointerDown(st, a), b));
const body = (st: EditorState) => toPathData(st.session.model);
const BOX = { x0: 0, y0: 0, x1: 10, y1: 10 }; // centre (5, 5), 5 from every edge
const ALL = [0, 1, 2, 3].map((i) => ({ sub: 0, i }));
const DEG = Math.PI / 180;

describe("the angle for a drag", () => {
  it("tan(angle) is the pointer's travel along the edge over the edge's distance from the centre", () => {
    expect(skewAngleFor("e", BOX, 3, false)).toBeCloseTo(Math.atan(0.6), 9); // 30.96°
    expect(skewAngleFor("n", BOX, 5, false)).toBeCloseTo(45 * DEG, 9);
  });

  it("the sign follows the pointer along the screen axis: up / left is negative", () => {
    expect(skewAngleFor("e", BOX, -3, false)).toBeLessThan(0);
    expect(skewAngleFor("n", BOX, -3, false)).toBeLessThan(0);
    expect(skewAngleFor("e", BOX, 0, false)).toBe(0);
  });

  it("Shift snaps to 15° steps; the angle never reaches 90°", () => {
    expect(skewAngleFor("e", BOX, 3, true)).toBeCloseTo(30 * DEG, 9);
    expect(skewAngleFor("e", BOX, 1e9, false)).toBeLessThanOrEqual(85 * DEG + 1e-9);
    expect(skewAngleFor("e", BOX, -1e9, false)).toBeGreaterThanOrEqual(-85 * DEG - 1e-9);
  });

  it("a box without extent cannot be skewed", () => {
    expect(skewAngleFor("n", { x0: 0, y0: 5, x1: 10, y1: 5 }, 4, false)).toBe(0);
  });
});

describe("the skew about the centre", () => {
  it("the right edge: the right side goes down by the angle, the left side up by the same", () => {
    expect(toPathData(skewAnchors(fromPathData(SQUARE), ALL, { edge: "e", box: BOX, angle: Math.atan(0.6) }))).toBe("M0 -3L10 3L10 13L0 7Z");
  });

  it("the top edge: the top goes right, the bottom left", () => {
    expect(toPathData(skewAnchors(fromPathData(SQUARE), ALL, { edge: "n", box: BOX, angle: Math.atan(0.8) }))).toBe("M4 0L14 0L6 10L-4 10Z");
  });

  it("the left and bottom edges follow their own pointer the same way", () => {
    expect(toPathData(skewAnchors(fromPathData(SQUARE), ALL, { edge: "w", box: BOX, angle: Math.atan(0.4) }))).toBe("M0 2L10 -2L10 8L0 12Z");
    expect(toPathData(skewAnchors(fromPathData(SQUARE), ALL, { edge: "s", box: BOX, angle: 45 * DEG }))).toBe("M-5 0L5 0L15 10L5 10Z");
  });

  it("a point on the centre line stays; unselected points and the given model stay", () => {
    const m = fromPathData("M0 0L10 5L20 10");
    const out = skewAnchors(m, [{ sub: 0, i: 0 }, { sub: 0, i: 2 }], { edge: "e", box: { x0: 0, y0: 0, x1: 20, y1: 10 }, angle: 45 * DEG });
    expect(toPathData(out)).toBe("M0 -10L10 5L20 20"); // centre x = 10: the middle anchor is unselected anyway
    expect(toPathData(m)).toBe("M0 0L10 5L20 10");
  });

  it("curve handles skew with their anchors", () => {
    const m = fromPathData("M0 0C10 0 10 10 0 10");
    const out = skewAnchors(m, [{ sub: 0, i: 0 }, { sub: 0, i: 1 }], { edge: "e", box: BOX, angle: 45 * DEG });
    expect(out.subs[0].anchors[0].out?.x).toBe(10);
    expect(out.subs[0].anchors[0].out?.y).toBeCloseTo(5, 9); // (x - 5) × tan 45° = 5
  });

  it("lengths along the sheared axis are kept (a shear, not a perspective)", () => {
    const out = skewAnchors(fromPathData(SQUARE), ALL, { edge: "e", box: BOX, angle: 30 * DEG });
    const a = out.subs[0].anchors;
    expect(a[1].x - a[0].x).toBe(10);
    expect(a[2].y - a[1].y).toBe(10);
  });
});

describe("what is under the pointer", () => {
  const st = boxSelected();
  const kind = (x: number, y: number) => boxTargetAt(st.session, { x, y }, U);

  it("an edge between two handles skews; the handles still scale; the corner zones still rotate", () => {
    expect(kind(2.5, -0.8)).toMatchObject({ kind: "skew", edge: "n" });
    expect(kind(7.5, 10.8)).toMatchObject({ kind: "skew", edge: "s" });
    expect(kind(10.8, 2.5)).toMatchObject({ kind: "skew", edge: "e" });
    expect(kind(-0.8, 7.5)).toMatchObject({ kind: "skew", edge: "w" });
    expect(kind(5, -0.8)).toMatchObject({ kind: "scale", handle: "n" });
    expect(kind(-0.8, -0.8)).toMatchObject({ kind: "scale", handle: "nw" });
    expect(kind(12, 12)).toMatchObject({ kind: "rotate" });
  });

  it("inside the box and far from it is nothing", () => {
    expect(kind(2.5, 2.5)).toBeNull();
    expect(kind(2.5, -3)).toBeNull();
  });

  it("the cursor is a double arrow parallel to the edge", () => {
    expect(cursorAt(st, at(2.5, -0.8))).toBe("ew-resize");
    expect(cursorAt(st, at(7.5, 10.8))).toBe("ew-resize");
    expect(cursorAt(st, at(10.8, 2.5))).toBe("ns-resize");
    expect(cursorAt(st, at(-0.8, 7.5))).toBe("ns-resize");
  });
});

describe("the drag", () => {
  it("the right edge dragged down skews the selection by angle as one undo step; the selection stays", () => {
    const st = drag(boxSelected(), at(10.8, 2.5), at(10.8, 5.5));
    expect(body(st)).toBe("M0 -3L10 3L10 13L0 7Z");
    expect(st.session.undo).toHaveLength(1);
    expect(st.session.selection).toHaveLength(4);
  });

  it("the top edge dragged sideways does the other axis; only the movement ALONG the edge counts", () => {
    expect(body(drag(boxSelected(), at(2.5, -0.8), at(6.5, -0.8)))).toBe("M4 0L14 0L6 10L-4 10Z");
    expect(body(drag(boxSelected(), at(2.5, -0.8), at(6.5, -4)))).toBe("M4 0L14 0L6 10L-4 10Z");
  });

  it("Shift snaps the angle to 15°", () => {
    const mid = pointerMove(pointerDown(boxSelected(), at(10.8, 2.5, { shift: true })), at(10.8, 5.5, { shift: true }));
    expect(mid.skewHint?.angle).toBeCloseTo(30, 6);
  });

  it("while dragging it shows the angle, the centre and the skewed box; releasing clears them", () => {
    const mid = pointerMove(pointerDown(boxSelected(), at(10.8, 2.5)), at(10.8, 5.5));
    expect(mid.skewHint?.angle).toBeCloseTo(30.96, 2);
    expect(mid.skewHint?.center).toEqual({ x: 5, y: 5 });
    expect(mid.skewHint?.quad).toEqual([{ x: 0, y: -3 }, { x: 10, y: 3 }, { x: 10, y: 13 }, { x: 0, y: 7 }].map((p) => expect.objectContaining(p)));
    expect(mid.session.undo).toHaveLength(0);
    expect(pointerUp(mid).skewHint ?? null).toBeNull();
  });

  it("a press and release without moving changes nothing and records nothing", () => {
    const st = drag(boxSelected(), at(10.8, 2.5), at(10.8, 2.5));
    expect(body(st)).toBe(SQUARE);
    expect(st.session.undo).toHaveLength(0);
  });

  it("is listed in the legend", () => {
    expect(EDIT_HOTKEYS.some((h) => h.keys === "Drag box edge" && /[Ss]kew/.test(h.text) && /angle/.test(h.text))).toBe(true);
  });
});

describe("the overlay of a skew", () => {
  const svg = () => document.createElementNS("http://www.w3.org/2000/svg", "svg");

  it("draws the angle readout, the centre mark and the skewed box while a skew is in progress", () => {
    const mid = pointerMove(pointerDown(boxSelected(), at(10.8, 2.5)), at(10.8, 5.5));
    const el = svg();
    drawEditOverlay(el, mid, { u: U, anchorPx: 10 });
    expect(el.querySelector("[data-skew-readout]")?.textContent).toBe("⊿ : 31.0°");
    expect(el.querySelectorAll("[data-skew-pivot]")).toHaveLength(1);
    expect(el.querySelector("[data-skew-quad]")?.getAttribute("points")).toBe("0,-3 10,3 10,13 0,7");
  });

  it("shows a negative angle with its sign, and nothing when no skew is going on", () => {
    const up = pointerMove(pointerDown(boxSelected(), at(10.8, 2.5)), at(10.8, -0.5));
    const el = svg();
    drawEditOverlay(el, up, { u: U, anchorPx: 10 });
    expect(el.querySelector("[data-skew-readout]")?.textContent).toBe("⊿ : -31.0°");
    const idle = svg();
    drawEditOverlay(idle, boxSelected(), { u: U, anchorPx: 10 });
    expect(idle.querySelector("[data-skew-readout]")).toBeNull();
    expect(idle.querySelector("[data-skew-pivot]")).toBeNull();
  });
});
