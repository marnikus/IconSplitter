// pathedit_stroke_lines.test.ts — stroke-only lines in edit mode (2026-11-23).
// Line icons put `fill="none"` and the pen on the ROOT <svg>: those shapes paint
// no area, so a press inside one neither picks nor moves it. Each stroke line
// is its own object: a press on (or near) it selects and drags that line only —
// never the other lines of the same <path> — and the line's drawn half width
// plus the click tolerance count as "on it".
import { describe, expect, it } from "vitest";
import { editorState, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { IDENTITY, type PathModel } from "../src/lib/pathedit/model";
import { loadObjects } from "../src/lib/pathedit/objects";
import { newSession } from "../src/lib/pathedit/session";

/** Two nested square rings in ONE path (like an outlined bread slice) and a separate line; pen 8 wide, no fill. */
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" stroke="#000" stroke-width="8">'
  + '<path d="M20 20L180 20L180 180L20 180ZM60 60L140 60L140 140L60 140Z"/>'
  + '<path d="M20 195L100 195L180 195"/></svg>';
const MATS = [IDENTITY, IDENTITY];

const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 1, target: null, ...mods });
const start = (objects: number[] = []) => editorState(newSession(loadObjects(ICON, MATS), objects));
const drag = (st: EditorState, a: PointerInput, b: PointerInput) => pointerUp(pointerMove(pointerDown(st, a), b));
const pts = (m: PathModel, sub: number) => m.subs[sub].anchors.map((a) => [a.x, a.y]);

describe("stroke-only shapes in edit mode (2026-11-23)", () => {
  it("inherit fill none and the pen width from the root <svg>", () => {
    const m = loadObjects(ICON, MATS);
    expect(m.subs.map((s) => s.paints)).toEqual([false, false, false]);
    expect(m.subs.map((s) => s.halfStroke)).toEqual([4, 4, 4]);
    const scaled = loadObjects(ICON, [{ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }, IDENTITY]);
    expect(scaled.subs[0].halfStroke).toBe(8); // the object's own transform scales its pen
  });

  it("a press inside an unfilled ring neither picks nor moves it", () => {
    const st = start();
    const after = drag(st, at(100, 100), at(110, 100));
    expect(after.session.objects).toEqual([]);
    expect(after.session.model).toEqual(st.session.model);
    expect(after.session.undo).toHaveLength(0);
  });

  it("a press on a ring's line drags that line only — not the other ring of the same path", () => {
    const st = start();
    const after = drag(st, at(100, 23), at(100, 33));
    expect(pts(after.session.model, 0)).toEqual([[20, 30], [180, 30], [180, 190], [20, 190]]);
    expect(pts(after.session.model, 1)).toEqual(pts(st.session.model, 1));
    expect(pts(after.session.model, 2)).toEqual(pts(st.session.model, 2));
    expect(after.session.objects).toEqual([0]);
    expect(after.session.selection.every((r) => r.sub === 0)).toBe(true);
    expect(after.session.undo).toHaveLength(1);
  });

  it("the line's half width plus the click tolerance count as on it", () => {
    // 16 px from the centre line: beyond the 14 px tolerance alone, within 4 (half pen) + 14
    const near = drag(start(), at(100, 4), at(100, 14));
    expect(pts(near.session.model, 0)[0]).toEqual([20, 30]);
    const far = drag(start(), at(100, -1), at(100, 9));
    expect(far.session.objects).toEqual([]);
    expect(far.session.undo).toHaveLength(0);
  });

  it("a plain click selects the line without an undo step", () => {
    const after = pointerUp(pointerDown(start(), at(180, 100)));
    expect(after.session.objects).toEqual([0]);
    expect(after.session.selection).toHaveLength(4);
    expect(after.session.selection.every((r) => r.sub === 0)).toBe(true);
    expect(after.session.undo).toHaveLength(0);
  });

  it("in an already editable path a segment press still drags the whole line; a picked point keeps point editing", () => {
    const st = start([0]);
    const whole = drag(st, at(100, 20), at(100, 30));
    expect(pts(whole.session.model, 0)).toEqual([[20, 30], [180, 30], [180, 190], [20, 190]]);
    expect(pts(whole.session.model, 1)).toEqual(pts(st.session.model, 1));

    const point = pointerUp(pointerDown(st, at(20, 20))); // an anchor: point editing
    const seg = drag(point, at(100, 180), at(100, 190));
    expect(pts(seg.session.model, 0)).toEqual([[20, 20], [180, 20], [180, 190], [20, 190]]);
  });

  it("an open stroked line moves whole from a press on any of its segments", () => {
    const after = drag(start([1]), at(140, 195), at(140, 185));
    expect(pts(after.session.model, 2)).toEqual([[20, 185], [100, 185], [180, 185]]);
  });
});
