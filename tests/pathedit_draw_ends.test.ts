// pathedit_draw_ends.test.ts — Draw on line ends (2026-11-26): with no line
// active a press on an open end picks it up and the line goes on from it (either
// end, any path); the active line's other end closes it; another line's end
// joins; a held drag pulls a smooth pair there. One undo step per press + drag.
import { describe, expect, it } from "vitest";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { isDirty, newSession, setTool, undoSession } from "../src/lib/pathedit/session";
import { editorState, keyDown, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";

const input = (x: number, y: number): PointerInput => ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1 });
const click = (st: EditorState, x: number, y: number) => pointerUp(pointerDown(st, input(x, y)));
const drag = (st: EditorState, from: [number, number], to: [number, number]) => pointerUp(pointerMove(pointerDown(st, input(...from)), input(...to)));
const draw = (d: string, objects: number[] = []): EditorState => editorState(setTool(newSession(fromPathData(d), objects), "draw"));
const d = (st: EditorState) => toPathData(st.session.model);

describe("Draw — picking up a line end", () => {
  it("a click on the LAST anchor goes on from it; the click alone changes nothing", () => {
    let st = click(draw("M0 0 L10 0"), 10, 0);
    expect(st.session.active).toBe(0);
    expect(isDirty(st.session)).toBe(false);
    expect(st.session.undo).toHaveLength(0);
    st = click(st, 10, 10);
    expect(d(st)).toBe("M0 0L10 0L10 10");
  });

  it("a click on the FIRST anchor goes on from it, adding before it", () => {
    let st = click(draw("M0 0 L10 0"), 0, 0);
    st = click(st, 0, 10);
    st = click(st, 5, 20);
    expect(d(st)).toBe("M5 20L0 10L0 0L10 0");
  });

  it("an end of a path that is not selected is picked up too, and its path becomes selected", () => {
    const m = fromPathData("M0 0 L10 0");
    m.subs[0].owner = 3;
    let st = editorState(setTool(newSession(m, []), "draw"));
    st = click(st, 10, 0);
    expect(st.session.active).toBe(0);
    expect(st.session.objects).toEqual([3]);
    st = click(st, 20, 0);
    expect(d(st)).toBe("M0 0L10 0L20 0");
    expect(st.session.model.subs[0].owner).toBe(3);
  });

  it("a middle anchor or a closed shape's anchor is only selected", () => {
    expect(click(draw("M0 0 L10 0 L20 0"), 10, 0).session.active).toBeNull();
    expect(click(draw("M0 0 L10 0 L10 10 Z"), 10, 0).session.active).toBeNull();
  });
});

describe("Draw — closing and joining", () => {
  it("the active line's other end closes it (from either end)", () => {
    let st = click(draw("M0 0 L10 0"), 10, 0);
    st = click(st, 10, 10);
    st = click(st, 0, 0);
    expect(d(st)).toBe("M0 0L10 0L10 10Z");
    expect(st.session.active).toBeNull();
    let back = click(draw("M0 0 L10 0"), 0, 0);
    back = click(back, 0, 10);
    back = click(back, 10, 0);
    expect(d(back)).toBe("M0 10L0 0L10 0Z");
  });

  it("another line's end joins the two (either end of either line), one undo step", () => {
    let st = click(draw("M0 0 L10 0 M20 0 L30 0"), 10, 0);
    st = click(st, 20, 0);
    expect(d(st)).toBe("M0 0L10 0L20 0L30 0");
    expect(st.session.undo).toHaveLength(1);
    expect(d(editorState(undoSession(st.session)))).toBe("M0 0L10 0M20 0L30 0");
    let rev = click(draw("M0 0 L10 0 M20 0 L30 0"), 0, 0);
    rev = click(rev, 30, 0);
    expect(d(rev)).toBe("M10 0L0 0L30 0L20 0");
  });
});

describe("Draw — a held drag pulls smooth handles", () => {
  it("on a new anchor drawn backwards, the dragged handle points the way the line goes", () => {
    let st = click(draw("M0 0 L10 0"), 0, 0);
    st = drag(st, [0, 10], [-5, 10]);
    const a = st.session.model.subs[0].anchors[0];
    expect(a.mode).toBe("smooth");
    expect(a.in).toEqual({ x: -5, y: 10 });
    expect(a.out).toEqual({ x: 5, y: 10 });
  });

  it("on the end picked up, on the closing anchor and on the joined end — each one undo step", () => {
    let st = drag(draw("M0 0 L10 0"), [10, 0], [15, 5]);
    expect(st.session.model.subs[0].anchors[1]).toMatchObject({ mode: "smooth", out: { x: 15, y: 5 }, in: { x: 5, y: -5 } });
    expect(st.session.undo).toHaveLength(1);
    st = click(st, 10, 10);
    st = drag(st, [0, 0], [0, -5]);
    expect(st.session.model.subs[0].closed).toBe(true);
    expect(st.session.model.subs[0].anchors[0]).toMatchObject({ mode: "smooth", out: { x: 0, y: -5 }, in: { x: 0, y: 5 } });
    expect(st.session.undo).toHaveLength(3);
    let j = click(draw("M0 0 L10 0 M20 0 L30 0"), 10, 0);
    j = drag(j, [20, 0], [20, 5]);
    expect(j.session.model.subs[0].anchors[2]).toMatchObject({ mode: "smooth", out: { x: 20, y: 5 } });
    expect(j.session.undo).toHaveLength(1);
  });

  it("Esc ends it; the next empty click starts a new line", () => {
    let st = click(draw("M0 0 L10 0"), 10, 0);
    st = keyDown(st, { key: "Escape", ctrl: false, shift: false }).state;
    st = click(st, 50, 50);
    expect(st.session.model.subs).toHaveLength(2);
  });
});
