// pathedit_line_ops.test.ts — line gestures in the edit mode (2026-11-06):
// double-click on a line selects all of its anchors (it no longer inserts);
// Ctrl + click on a line inserts an anchor; Delete removes points and keeps the
// line joined; Ctrl + Delete breaks the line at the selected points. And the
// tail cutter's highlights can be hidden.
import { describe, expect, it } from "vitest";
import { doubleClick, editorState, keyDown, pointerDown, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { breakAtAnchors } from "../src/lib/pathedit/ops";
import { newSession } from "../src/lib/pathedit/session";
import { getTailMarksHidden, setTailMarksHidden } from "../src/svg/tailcut/tailreview";
import { readFileSync } from "node:fs";

const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null, ...mods });
const start = (d = "M0 0L10 0L20 0L30 0 M0 50L10 50"): EditorState => editorState(newSession(fromPathData(d)));
const key = (st: EditorState, k: string, ctrl = false) => keyDown(st, { key: k, ctrl, shift: false }).state;

describe("double-click and Ctrl + click on a line", () => {
  it("double-click on a line selects all of its anchors and adds none", () => {
    const st = doubleClick(start(), at(15, 0));
    expect(st.session.selection).toEqual([{ sub: 0, i: 0 }, { sub: 0, i: 1 }, { sub: 0, i: 2 }, { sub: 0, i: 3 }]);
    expect(st.session.model.subs[0].anchors).toHaveLength(4);
  });

  it("Ctrl + click on a line inserts an anchor there (one undo step)", () => {
    const st = pointerUp(pointerDown(start(), at(15, 0, { ctrl: true })));
    expect(toPathData(st.session.model)).toBe("M0 0L10 0L15 0L20 0L30 0M0 50L10 50");
    expect(st.session.selection).toEqual([{ sub: 0, i: 2 }]);
    expect(st.session.undo).toHaveLength(1);
  });
});

describe("Delete and Ctrl + Delete", () => {
  const selectPoint = (st: EditorState, x: number) => pointerUp(pointerDown(st, at(x, 0)));

  it("Delete removes the point and keeps the line joined", () => {
    expect(toPathData(key(selectPoint(start(), 10), "Delete").session.model)).toBe("M0 0L20 0L30 0M0 50L10 50");
  });

  it("Ctrl + Delete breaks the line at the point", () => {
    expect(toPathData(key(selectPoint(start(), 20), "Delete", true).session.model)).toBe("M0 0L10 0M0 50L10 50");
    expect(toPathData(key(selectPoint(start("M0 0L10 0L20 0L30 0L40 0"), 20), "Backspace", true).session.model)).toBe("M0 0L10 0M30 0L40 0");
  });

  it("breaking a closed shape opens it at the point; a lone leftover point goes", () => {
    const square = fromPathData("M0 0L10 0L10 10L0 10Z");
    expect(toPathData(breakAtAnchors(square, [{ sub: 0, i: 0 }]))).toBe("M10 0L10 10L0 10");
    expect(toPathData(breakAtAnchors(fromPathData("M0 0L10 0L20 0"), [{ sub: 0, i: 1 }]))).toBe("");
  });

  it("a broken curve end loses the handle that pointed at the removed segment", () => {
    const m = breakAtAnchors(fromPathData("M0 0C5 0 5 10 10 10C15 10 15 0 20 0L30 0"), [{ sub: 0, i: 2 }]);
    expect(m.subs[0].anchors[1].out).toBeNull();
    expect(m.subs[0].anchors[1].in).not.toBeNull();
  });
});

describe("the tail cutter's highlights can be hidden", () => {
  it("a session switch the rows follow, and a Hide / Show button in the bulk bar", () => {
    setTailMarksHidden(true);
    expect(getTailMarksHidden()).toBe(true);
    setTailMarksHidden(false);
    expect(readFileSync("src/svg/tailcut/TailCutBar.tsx", "utf8")).toContain("svg-cut-hide");
    expect(readFileSync("src/svg/SvgThumbs.tsx", "utf8")).toContain("useRowTailMarks(");
    expect(readFileSync("src/svg/tailcut/tailreview.ts", "utf8")).toMatch(/useRowTailMarks[\s\S]*useTailMarksHidden\(\)/);
  });
});
