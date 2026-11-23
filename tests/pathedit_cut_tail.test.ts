// pathedit_cut_tail.test.ts — the two TAILS of a line (2026-11-20). Alt + Shift
// used to need a crossing on BOTH sides of the click, so a line's own tails —
// before its first crossing and after its last — could not be removed at all.
// A tail is now selectable the same way a bounded stretch is: the red mark runs
// from the crossing to the line's open end, the click splits at the crossing and
// drops the tail. A line with no crossing at all is still not a tail.
import { describe, expect, it } from "vitest";
import { editorState, hoverAt, pointerDown, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";
import { removeStretch, stretchAt, stretchPoints } from "../src/lib/pathedit/stretch";

const model = (d: string) => fromPathData(d);
const text = (m: ReturnType<typeof fromPathData> | null) => (m === null ? null : toPathData(m));
const H = "M0 50L100 50";
const V1 = "M30 0L30 100";
const V2 = "M70 0L70 100";

describe("which tail is under the click", () => {
  it("after the last crossing: from that crossing to the line's end", () => {
    const s = stretchAt(model(H + V1), 0, 0.5);
    expect(s?.from).toBeCloseTo(0.3, 6);
    expect(s?.to).toBeCloseTo(1, 6);
  });

  it("before the first crossing: from the line's start to it", () => {
    const s = stretchAt(model(H + V2), 0, 0.1);
    expect(s?.from).toBeCloseTo(0, 6);
    expect(s?.to).toBeCloseTo(0.7, 6);
  });

  it("with two crossings around the click it is still the bounded stretch", () => {
    const s = stretchAt(model(H + V1 + V2), 0, 0.5);
    expect(s?.from).toBeCloseTo(0.3, 6);
    expect(s?.to).toBeCloseTo(0.7, 6);
  });

  it("a line with NO crossing is not a tail: Alt + click already removes a segment", () => {
    expect(stretchAt(model(H), 0, 0.5)).toBeNull();
  });

  it("a closed shape keeps the both-sides rule (it wraps, so it always has two)", () => {
    const m = model("M10 10L90 10L90 90L10 90Z" + "M50 0L50 100");
    const st = stretchAt(m, 0, 0.1)!; // the top-left corner, between the crossings below and right
    expect(st).not.toBeNull();
    expect(text(removeStretch(m, 0, st))).toBe("M50 10L90 10L90 90L50 90M50 0L50 100");
  });
});

describe("removing a tail", () => {
  it("splits at the crossing and drops what lies beyond it", () => {
    const m = model(H + V1);
    const out = removeStretch(m, 0, stretchAt(m, 0, 0.5)!); // the tail right of the crossing at 30
    expect(text(out)).toBe("M0 50L30 50" + V1);
    expect(text(m)).toBe(H + V1); // the given model is never touched
  });

  it("does the same on the start side", () => {
    const m = model(H + V2);
    expect(text(removeStretch(m, 0, stretchAt(m, 0, 0.1)!))).toBe("M70 50L100 50" + V2);
  });

  it("a crossed line with both tails can lose either one, one at a time", () => {
    const m = model(H + V1 + V2);
    expect(text(removeStretch(m, 0, stretchAt(m, 0, 0.1)!))).toBe("M30 50L100 50" + V1 + V2);
    expect(text(removeStretch(m, 0, stretchAt(m, 0, 0.9)!))).toBe("M0 50L70 50" + V1 + V2);
  });

  it("the hint runs from the crossing to the open end", () => {
    const m = model(H + V1);
    const pts = stretchPoints(m, 0, stretchAt(m, 0, 0.5)!);
    expect(pts[0].x).toBeCloseTo(30, 6);
    expect(pts.at(-1)!.x).toBeCloseTo(100, 6);
  });
});

describe("the gesture", () => {
  const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
    ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null, ...mods });
  const both = { alt: true, shift: true };
  const start = (): EditorState => editorState(newSession(model(H + V1)));
  const click = (st: EditorState, i: PointerInput) => pointerUp(pointerDown(st, i));
  const body = (st: EditorState) => toPathData(st.session.model);

  it("Alt + Shift over a tail marks it, and the click removes it as one undo step", () => {
    const shown = hoverAt(start(), at(60, 50, both));
    expect(shown.cutHint?.[0].x).toBeCloseTo(30, 6);
    expect(shown.cutHint?.at(-1)?.x).toBeCloseTo(100, 6);
    const st = click(start(), at(60, 50, both));
    expect(body(st)).toBe("M0 50L30 50" + V1);
    expect(st.session.undo).toHaveLength(1);
  });

  it("the same click on the start side takes the other tail", () => {
    const m = model(H + V2);
    const st = click(editorState(newSession(m)), at(10, 50, both));
    expect(toPathData(st.session.model)).toBe("M70 50L100 50" + V2);
  });
});
