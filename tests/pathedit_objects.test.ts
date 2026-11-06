// pathedit_objects.test.ts — several paths ("objects") in one edit session
// (2026-11-06): a click on a path selects only that path, another click
// switches, Shift+click adds or removes; Esc clears anchors, then objects; the
// marquee selects anchors across paths and selects their paths; selected
// anchors of several objects move together; snapping also uses unselected
// paths; Finish writes back only the objects that changed, each in its own
// coordinates.
import { describe, expect, it } from "vitest";
import { editorState, keyDown, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { IDENTITY, toPathData, type Affine } from "../src/lib/pathedit/model";
import { dirtyObjects, loadObjects, writeObjects } from "../src/lib/pathedit/objects";
import { newSession } from "../src/lib/pathedit/session";

const SRC = '<svg viewBox="0 0 100 100"><path d="M0 0L10 0"/><path d="M50 50L60 50"/></svg>';
const I = [IDENTITY, IDENTITY];
const start = (objects: number[] = [], src = SRC, m: Affine[] = I): EditorState => editorState(newSession(loadObjects(src, m), objects));
const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null, ...mods });
const click = (st: EditorState, i: PointerInput) => pointerUp(pointerDown(st, i));
const drag = (st: EditorState, a: PointerInput, b: PointerInput) => pointerUp(pointerMove(pointerDown(st, a), b));
const esc = (st: EditorState) => keyDown(st, { key: "Escape", ctrl: false, shift: false }).state;

describe("selecting objects", () => {
  it("a click on a path selects only it; another path switches; Shift adds and removes", () => {
    let st = click(start(), at(30, 30, { target: 0 }));
    expect(st.session.objects).toEqual([0]);
    st = click(st, at(80, 80, { target: 1 }));
    expect(st.session.objects).toEqual([1]);
    st = click(st, at(30, 30, { target: 0, shift: true }));
    expect(st.session.objects).toEqual([1, 0]);
    st = click(st, at(80, 80, { target: 1, shift: true }));
    expect(st.session.objects).toEqual([0]);
  });

  it("Esc clears the selected anchors first, then the selected paths", () => {
    let st = click(start([0]), at(10, 0));
    expect(st.session.selection).toHaveLength(1);
    st = esc(st);
    expect(st.session.selection).toEqual([]);
    expect(st.session.objects).toEqual([0]);
    expect(esc(st).session.objects).toEqual([]);
  });

  it("an unselected path's anchors cannot be grabbed", () => {
    const st = click(start([0]), at(50, 50));
    expect(st.session.selection).toEqual([]);
  });
});

describe("editing several objects", () => {
  it("the marquee selects anchors across paths and selects their paths", () => {
    const st = drag(start([0]), at(5, -5), at(55, 55));
    expect(st.session.selection).toEqual([{ sub: 0, i: 1 }, { sub: 1, i: 0 }]);
    expect(st.session.objects).toEqual([0, 1]);
  });

  it("selected anchors of two objects move together", () => {
    let st = drag(start([0, 1]), at(5, -5), at(55, 55));
    st = drag(st, at(10, 0), at(12, 1));
    expect(toPathData(st.session.model)).toBe("M0 0L12 1M52 51L60 50");
    expect(dirtyObjects(st.session)).toEqual([0, 1]);
  });

  it("an anchor snaps to an unselected path's end", () => {
    const st = drag(start([0]), at(10, 0), at(49.6, 49.5, { shift: true }));
    expect(st.session.model.subs[0].anchors[1]).toMatchObject({ x: 50, y: 50 });
  });
});

describe("Finish writes only the changed objects, each in its own coordinates", () => {
  it("leaves an untouched path byte for byte", () => {
    const st = drag(start([0]), at(10, 0), at(20, 0));
    expect(writeObjects(SRC, st.session, I)).toBe('<svg viewBox="0 0 100 100"><path d="M0 0L20 0"/><path d="M50 50L60 50"/></svg>');
    expect(writeObjects(SRC, start([0]).session, I)).toBeNull(); // nothing changed
  });

  it("a scaled path is edited in icon space and written back in its own units", () => {
    const scale2: Affine = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
    const src = '<svg><path d="M0 0L10 0"/></svg>';
    let st = start([0], src, [scale2]);
    expect(st.session.model.subs[0].anchors[1]).toMatchObject({ x: 20, y: 0 }); // icon space
    st = drag(st, at(20, 0), at(30, 0));
    expect(writeObjects(src, st.session, [scale2])).toBe('<svg><path d="M0 0L15 0"/></svg>');
  });
});
