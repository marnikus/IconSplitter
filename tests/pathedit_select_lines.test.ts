// pathedit_select_lines.test.ts — selecting whole objects and lines in the edit
// mode (2026-11-10). Ctrl+A selects every object on the artboard (and all their
// anchors). Double-click on a line selects that whole line; with Shift it is
// ADDED to what is already selected, with Alt the whole line is EXCLUDED the
// same way. Alt + click on a line still removes that segment — but an Alt +
// double-click is an exclusion, so a removal made by its first click is undone.
import { describe, expect, it } from "vitest";
import {
  doubleClick, editorState, keyDown, pointerDown, pointerUp, type EditorState, type PointerInput,
} from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";
import { EDIT_HOTKEYS } from "../src/svg/pathedit/hotkeys";

const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null, ...mods });
const TWO = "M0 0L10 0L20 0M0 10L10 10L20 10"; // line 0 along y = 0, line 1 along y = 10
const start = (): EditorState => editorState(newSession(fromPathData(TWO)));
const click = (st: EditorState, i: PointerInput) => pointerUp(pointerDown(st, i));
const body = (st: EditorState) => toPathData(st.session.model);
const sel = (st: EditorState) => st.session.selection.map((r) => `${r.sub}:${r.i}`).sort();
const LINE0 = ["0:0", "0:1", "0:2"];
const LINE1 = ["1:0", "1:1", "1:2"];
const ctrlA = (st: EditorState) => keyDown(st, { key: "a", ctrl: true, shift: false });

describe("Ctrl + A", () => {
  it("selects every object on the artboard and all their anchors; no undo step", () => {
    const owned = editorState(newSession(fromPathData("M0 0L10 0", 0), []));
    const two = { ...owned, session: { ...owned.session, model: { subs: [...fromPathData("M0 0L10 0", 0).subs, ...fromPathData("M0 5L10 5", 1).subs] } } };
    const r = ctrlA(two);
    expect(r.handled).toBe(true);
    expect(r.finish).toBe(false);
    expect(r.state.session.objects).toEqual([0, 1]);
    expect(r.state.session.selection).toHaveLength(4);
    expect(r.state.session.undo).toHaveLength(0);
  });

  it("replaces a smaller selection and ends a draw in progress", () => {
    let st = click(start(), at(0, 0));
    expect(sel(st)).toEqual(["0:0"]);
    st = { ...st, session: { ...st.session, active: 0 } };
    const all = ctrlA(st).state;
    expect(sel(all)).toEqual([...LINE0, ...LINE1]);
    expect(all.session.active).toBeNull();
  });

  it("is a key of the editor (handled, so the browser's select-all never runs) and is in the legend", () => {
    expect(ctrlA(start()).handled).toBe(true);
    expect(keyDown(start(), { key: "a", ctrl: false, shift: false }).handled).toBe(false);
    expect(EDIT_HOTKEYS.some((h) => h.keys === "Ctrl+A" && /[Ss]elect all/.test(h.text))).toBe(true);
  });
});

describe("double-click on a line", () => {
  it("selects the whole line (the old selection is replaced)", () => {
    expect(sel(doubleClick(click(start(), at(0, 10)), at(5, 0)))).toEqual(LINE0);
  });

  it("with Shift: the second line is added to the previous selection", () => {
    const first = doubleClick(start(), at(5, 0));
    expect(sel(doubleClick(first, at(5, 10, { shift: true })))).toEqual([...LINE0, ...LINE1]);
  });

  it("with Shift the whole gesture keeps the previous selection: the clicks add, the double-click completes", () => {
    let st = doubleClick(start(), at(5, 0));
    st = click(st, at(5, 10, { shift: true }));
    expect(sel(st)).toEqual([...LINE0, "1:0", "1:1"]); // a Shift + click on a line adds its two points
    st = click(st, at(5, 10, { shift: true }));
    st = doubleClick(st, at(5, 10, { shift: true }));
    expect(sel(st)).toEqual([...LINE0, ...LINE1]);
  });

  it("with Alt: the whole line is excluded from the selection, the other line stays", () => {
    const all = ctrlA(start()).state;
    expect(sel(doubleClick(all, at(5, 0, { alt: true })))).toEqual(LINE1);
    expect(sel(doubleClick(all, at(5, 10, { alt: true })))).toEqual(LINE0);
  });

  it("with Alt on a line that is not selected, nothing changes", () => {
    const only0 = doubleClick(start(), at(5, 0));
    expect(sel(doubleClick(only0, at(5, 10, { alt: true })))).toEqual(LINE0);
  });

  it("also works on one of the line's points", () => {
    const all = ctrlA(start()).state;
    expect(sel(doubleClick(all, at(10, 0, { alt: true })))).toEqual(LINE1);
    expect(sel(doubleClick(doubleClick(start(), at(0, 0)), at(20, 10, { shift: true })))).toEqual([...LINE0, ...LINE1]);
  });

  it("only in Select", () => {
    const draw = { ...start(), session: { ...start().session, tool: "draw" as const } };
    expect(sel(doubleClick(draw, at(5, 0)))).toEqual([]);
  });
});

describe("Alt + click removes a segment — Alt + double-click excludes the line instead", () => {
  const t = 1000;
  const altClick = (st: EditorState, time: number) => click(st, at(5, 0, { alt: true, time }));

  it("a single Alt + click still removes just that segment", () => {
    const st = altClick(start(), t);
    expect(body(st)).toBe("M10 0L20 0M0 10L10 10L20 10");
  });

  it("two quick Alt clicks and the double-click: the removal is undone and the line is excluded", () => {
    let st = ctrlA(start()).state;
    st = altClick(st, t);
    expect(body(st)).not.toBe(TWO);
    st = altClick(st, t + 150);
    st = doubleClick(st, at(5, 0, { alt: true, time: t + 160 }));
    expect(body(st)).toBe(TWO); // nothing was removed
    expect(st.session.undo).toHaveLength(0); // and no undo step is left behind
    expect(sel(st)).toEqual(LINE1);
  });

  it("a double-click long after the removal is not tied to it", () => {
    let st = altClick(ctrlA(start()).state, t);
    const removed = body(st);
    st = doubleClick(st, at(5, 0, { alt: true, time: t + 5000 }));
    expect(body(st)).toBe(removed);
    expect(st.session.undo).toHaveLength(1);
  });

  it("without a removal just before, Alt + double-click on a line only changes the selection", () => {
    const st = doubleClick(ctrlA(start()).state, at(5, 0, { alt: true, time: t }));
    expect(body(st)).toBe(TWO);
    expect(sel(st)).toEqual(LINE1);
  });
});
