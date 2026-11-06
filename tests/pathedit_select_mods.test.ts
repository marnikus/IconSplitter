// pathedit_select_mods.test.ts — adding to and removing from an anchor
// selection (2026-11-06): Shift + click adds a point, Shift + box adds a group;
// Alt + click removes a point, Alt + box removes a group; a plain click or box
// still replaces. A Shift / Alt click on empty space keeps the selection.
import { describe, expect, it } from "vitest";
import { editorState, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";

const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null, ...mods });
const start = (): EditorState => editorState(newSession(fromPathData("M0 0L10 0L20 0L30 0L40 0")));
const click = (st: EditorState, i: PointerInput) => pointerUp(pointerDown(st, i));
const box = (st: EditorState, a: PointerInput, b: PointerInput) => pointerUp(pointerMove(pointerDown(st, a), b));
const ids = (st: EditorState) => st.session.selection.map((r) => r.i).sort((x, y) => x - y);

describe("clicks", () => {
  it("Shift + click adds a point; a plain click replaces", () => {
    let st = click(start(), at(0, 0));
    st = click(st, at(20, 0, { shift: true }));
    st = click(st, at(40, 0, { shift: true }));
    expect(ids(st)).toEqual([0, 2, 4]);
    expect(ids(click(st, at(10, 0)))).toEqual([1]);
  });

  it("Alt + click removes a point and moves nothing", () => {
    let st = box(start(), at(-5, -5), at(45, 5));
    st = click(st, at(20, 0, { alt: true }));
    expect(ids(st)).toEqual([0, 1, 3, 4]);
    expect(st.session.model.subs[0].anchors[2]).toMatchObject({ x: 20, y: 0 });
    expect(st.session.undo).toHaveLength(0);
  });

  it("Shift + drag on a point adds it and moves the whole selection", () => {
    let st = click(start(), at(0, 0));
    st = pointerUp(pointerMove(pointerDown(st, at(10, 0, { shift: true })), at(10, 3, { shift: true })));
    expect(ids(st)).toEqual([0, 1]);
    expect(st.session.model.subs[0].anchors[0]).toMatchObject({ x: 0, y: 3 });
    expect(st.session.model.subs[0].anchors[1]).toMatchObject({ x: 10, y: 3 });
  });
});

describe("boxes", () => {
  it("Shift + box adds a group to the selection", () => {
    let st = box(start(), at(-5, -5), at(15, 5)); // 0, 1
    st = box(st, at(25, -5, { shift: true }), at(45, 5, { shift: true })); // + 3, 4
    expect(ids(st)).toEqual([0, 1, 3, 4]);
  });

  it("Alt + box removes a group from the selection", () => {
    let st = box(start(), at(-5, -5), at(45, 5));
    st = box(st, at(5, -5, { alt: true }), at(25, 5, { alt: true })); // − 1, 2
    expect(ids(st)).toEqual([0, 3, 4]);
  });

  it("a plain box replaces; a Shift / Alt click on empty space keeps the selection", () => {
    let st = box(start(), at(-5, -5), at(15, 5));
    expect(ids(click(st, at(5, 30, { shift: true })))).toEqual([0, 1]);
    expect(ids(click(st, at(5, 30, { alt: true })))).toEqual([0, 1]);
    st = box(st, at(25, -5), at(45, 5));
    expect(ids(st)).toEqual([3, 4]);
  });
});
