// pathedit_remove_segment.test.ts — Alt + click on a line between two anchors
// (2026-11-09) removes just that line: the two anchors stay, every other line
// keeps its exact shape (curve handles included). An open line splits in two, a
// closed shape opens there. One undo step.
import { describe, expect, it } from "vitest";
import { editorState, keyDown, pointerDown, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { removeSegment } from "../src/lib/pathedit/ops";
import { newSession } from "../src/lib/pathedit/session";
import { EDIT_HOTKEYS } from "../src/svg/pathedit/hotkeys";

const d = (m: ReturnType<typeof fromPathData> | null) => (m === null ? null : toPathData(m));

describe("removeSegment", () => {
  it("an open line splits into two; the other segments are untouched", () => {
    const m = fromPathData("M0 0L10 0L20 0L30 0L40 0");
    expect(d(removeSegment(m, 0, 1))).toBe("M0 0L10 0M20 0L30 0L40 0"); // the 10→20 segment is gone
    expect(m.subs).toHaveLength(1); // the given model is never touched
  });

  it("a segment at an end leaves the rest as one line; a lone point is no line", () => {
    const m = fromPathData("M0 0L10 0L20 0L30 0");
    expect(d(removeSegment(m, 0, 0))).toBe("M10 0L20 0L30 0");
    expect(d(removeSegment(m, 0, 2))).toBe("M0 0L10 0L20 0");
  });

  it("the only segment of a two-point line removes the line", () => {
    expect(d(removeSegment(fromPathData("M0 0L10 0"), 0, 0))).toBe("");
  });

  it("a closed shape opens at that segment and keeps the rest", () => {
    const sq = fromPathData("M0 0L10 0L10 10L0 10Z");
    expect(d(removeSegment(sq, 0, 0))).toBe("M10 0L10 10L0 10L0 0"); // 0→10 gone, walks the other way round
    expect(d(removeSegment(sq, 0, 3))).toBe("M0 0L10 0L10 10L0 10"); // the closing line gone
  });

  it("curves keep their shape: only the handles that belonged to the removed segment go", () => {
    const m = fromPathData("M0 0C0 10 10 10 10 0C10 -10 20 -10 20 0C20 10 30 10 30 0");
    const out = removeSegment(m, 0, 1);
    expect(d(out)).toBe("M0 0C0 10 10 10 10 0M20 0C20 10 30 10 30 0");
  });

  it("returns null for a segment that does not exist", () => {
    expect(removeSegment(fromPathData("M0 0L10 0"), 0, 1)).toBeNull(); // the last anchor has no segment after it
    expect(removeSegment(fromPathData("M0 0L10 0"), 4, 0)).toBeNull();
  });
});

describe("Alt + click on a line", () => {
  const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
    ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null, ...mods });
  const start = (): EditorState => editorState(newSession(fromPathData("M0 0L10 0L20 0L30 0L40 0")));
  const click = (st: EditorState, i: PointerInput) => pointerUp(pointerDown(st, i));
  const text = (st: EditorState) => toPathData(st.session.model);

  it("removes the line under the pointer and nothing else, as one undo step", () => {
    const st = click(start(), at(15, 0, { alt: true }));
    expect(text(st)).toBe("M0 0L10 0M20 0L30 0L40 0");
    expect(st.session.undo).toHaveLength(1);
    expect(st.session.selection).toEqual([]);
  });

  it("Ctrl+Z puts the line back, Ctrl+Shift+Z removes it again", () => {
    let st = click(start(), at(15, 0, { alt: true }));
    st = keyDown(st, { key: "z", ctrl: true, shift: false }).state;
    expect(text(st)).toBe("M0 0L10 0L20 0L30 0L40 0");
    st = keyDown(st, { key: "Z", ctrl: true, shift: true }).state;
    expect(text(st)).toBe("M0 0L10 0M20 0L30 0L40 0");
  });

  it("a plain click on the line removes nothing; Alt on a point still only deselects it", () => {
    expect(text(click(start(), at(15, 0)))).toBe("M0 0L10 0L20 0L30 0L40 0");
    const st = click(click(start(), at(20, 0)), at(20, 0, { alt: true }));
    expect(st.session.selection).toEqual([]);
    expect(text(st)).toBe("M0 0L10 0L20 0L30 0L40 0");
  });

  it("is listed in the hotkey legend", () => {
    expect(EDIT_HOTKEYS.some((h) => h.keys === "Alt+Click line" && /Remove the line/.test(h.text))).toBe(true);
  });
});
