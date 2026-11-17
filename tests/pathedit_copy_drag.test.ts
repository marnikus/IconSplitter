// pathedit_copy_drag.test.ts — edit mode (2026-11-06): Ctrl+C / Ctrl+V copy and
// paste the selected anchors (each run of selected points along a line is one
// piece; a fully selected closed shape stays closed; pasted a little offset,
// selected, one undo step; the clipboard outlives the session, so it pastes
// into the next SVG too). And a press on a LINE of the selection drags the
// whole selection, like a press on one of its anchors.
import { beforeEach, describe, expect, it } from "vitest";
import { clearEditClipboard, editorState, keyDown, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";
import { EDIT_HOTKEYS } from "../src/svg/pathedit/hotkeys";

const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null, ...mods });
const start = (d: string): EditorState => editorState(newSession(fromPathData(d)));
const box = (st: EditorState, a: [number, number], b: [number, number]) => pointerUp(pointerMove(pointerDown(st, at(...a)), at(...b)));
const drag = (st: EditorState, a: [number, number], b: [number, number]) => pointerUp(pointerMove(pointerDown(st, at(...a)), at(...b)));
const ctrl = (st: EditorState, key: string) => keyDown(st, { key, ctrl: true, shift: false }).state;

beforeEach(() => clearEditClipboard());

describe("dragging the selection by a line", () => {
  it("with every anchor selected, pressing a line moves the whole shape", () => {
    let st = box(start("M0 0L10 0L10 10L0 10Z"), [-2, -2], [12, 12]);
    st = drag(st, [5, 0], [7, 3]); // on the top line, not an anchor
    expect(toPathData(st.session.model)).toBe("M2 3L12 3L12 13L2 13Z");
    expect(st.session.undo).toHaveLength(1);
  });

  it("a line outside the selection still grabs just that segment", () => {
    const st = drag(start("M0 0L10 0L20 0"), [15, 0], [15, 5]);
    expect(toPathData(st.session.model)).toBe("M0 0L10 5L20 5");
  });
});

describe("copy and paste", () => {
  it("Ctrl+C / Ctrl+V duplicates the selected run, offset and selected, in one undo step", () => {
    let st = box(start("M0 0L10 0L20 0L30 0"), [-2, -2], [12, 2]); // anchors 0 and 1
    st = ctrl(st, "c");
    st = ctrl(st, "v");
    expect(st.session.model.subs).toHaveLength(2);
    const pasted = st.session.model.subs[1].anchors;
    expect(pasted).toHaveLength(2);
    expect(pasted[0].x).toBeGreaterThan(0); // offset, not on top of the original
    expect(st.session.selection).toEqual([{ sub: 1, i: 0 }, { sub: 1, i: 1 }]);
    expect(st.session.undo).toHaveLength(1);
  });

  it("a fully selected closed shape pastes closed; separate runs paste as separate pieces; lone points are skipped", () => {
    let st = box(start("M0 0L10 0L10 10L0 10Z"), [-2, -2], [12, 12]);
    st = ctrl(ctrl(st, "c"), "v");
    expect(st.session.model.subs[1].closed).toBe(true);
    let open = start("M0 0L10 0L20 0L30 0L40 0L50 0");
    open = box(open, [-2, -2], [12, 2]);
    open = box(open, [28, -2], [52, 2], );
    open = { ...open, session: { ...open.session, selection: [{ sub: 0, i: 0 }, { sub: 0, i: 1 }, { sub: 0, i: 3 }, { sub: 0, i: 4 }, { sub: 0, i: 5 }] } };
    open = ctrl(ctrl(open, "c"), "v");
    expect(open.session.model.subs.slice(1).map((s) => s.anchors.length)).toEqual([2, 3]);
  });

  it("the clipboard outlives the session: copy in one SVG, paste in the next", () => {
    const first = ctrl(box(start("M0 0L10 0"), [-2, -2], [12, 2]), "c");
    void first;
    const next = ctrl(start("M50 50L60 60"), "v");
    expect(next.session.model.subs).toHaveLength(2);
    expect(next.session.model.subs[1].anchors).toHaveLength(2);
  });

  it("nothing selected copies nothing (the clipboard is kept); nothing copied pastes nothing", () => {
    let st = ctrl(start("M0 0L10 0"), "v");
    expect(st.session.model.subs).toHaveLength(1);
    st = ctrl(box(start("M0 0L10 0"), [-2, -2], [12, 2]), "c");
    st = ctrl({ ...st, session: { ...st.session, selection: [] } }, "c");
    expect(ctrl(st, "v").session.model.subs).toHaveLength(2);
  });

  it("the legend lists them", () => {
    const keys = EDIT_HOTKEYS.map((h) => h.keys);
    expect(keys).toContain("Ctrl+C");
    expect(keys).toContain("Ctrl+V");
  });
});
