// pathedit_cut_between.test.ts — Alt + Shift + click on a line (2026-11-09)
// deletes the part of that line between the two crossings around the click,
// even when the line has no anchors there: anchors are made on both crossings
// (the shape is kept) and the stretch between them goes. While the keys are
// held the stretch is shown (cutHint). One undo step.
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

describe("which stretch is under the click", () => {
  it("is the part between the nearest crossing on each side", () => {
    const s = stretchAt(model(H + V1 + V2), 0, 0.5);
    expect(s?.from).toBeCloseTo(0.3, 6);
    expect(s?.to).toBeCloseTo(0.7, 6);
  });

  it("needs a crossing on both sides (an open line): one crossing, or none, is no stretch", () => {
    expect(stretchAt(model(H + V1 + V2), 0, 0.1)).toBeNull(); // only the line at 30 is ahead
    expect(stretchAt(model(H + V1), 0, 0.5)).toBeNull();
    expect(stretchAt(model(H), 0, 0.5)).toBeNull();
  });

  it("a line that ends ON the clicked line counts as crossing it", () => {
    const s = stretchAt(model(H + "M30 0L30 50" + V2), 0, 0.5);
    expect(s?.from).toBeCloseTo(0.3, 6);
  });

  it("its own neighbouring segments are no crossings", () => {
    expect(stretchAt(model("M0 50L40 50L100 50" + V2), 0, 0.2)).toBeNull();
  });
});

describe("removing the stretch", () => {
  it("makes anchors on both crossings and removes the part between; the rest stays", () => {
    const m = model(H + V1 + V2);
    const out = removeStretch(m, 0, stretchAt(m, 0, 0.5)!);
    expect(text(out)).toBe("M0 50L30 50M70 50L100 50" + V1 + V2);
    expect(text(m)).toBe(H + V1 + V2); // the given model is never touched
  });

  it("an anchor inside the stretch goes with it", () => {
    const m = model("M0 50L50 50L100 50" + V1 + V2);
    expect(text(removeStretch(m, 0, stretchAt(m, 0, 0.8)!))).toBe("M0 50L30 50M70 50L100 50" + V1 + V2);
  });

  it("a crossing exactly at an anchor reuses it", () => {
    const m = model("M0 50L30 50L100 50" + V1 + V2);
    expect(text(removeStretch(m, 0, stretchAt(m, 0, 1.3)!))).toBe("M0 50L30 50M70 50L100 50" + V1 + V2);
  });

  it("works across several segments of an open line", () => {
    const m = model("M0 50L20 50L50 50L80 50L100 50" + V1 + V2);
    expect(text(removeStretch(m, 0, stretchAt(m, 0, 2.2)!))).toBe("M0 50L20 50L30 50M70 50L80 50L100 50" + V1 + V2);
  });

  it("on a curve the pieces keep the curve; the new ends sit on the crossings", () => {
    const m = model("M0 50C30 20 70 80 100 50" + V1 + V2);
    const out = removeStretch(m, 0, stretchAt(m, 0, 0.5)!)!;
    expect(out.subs).toHaveLength(4);
    expect(out.subs[0].anchors.at(-1)!.x).toBeCloseTo(30, 0);
    expect(out.subs[1].anchors[0].x).toBeCloseTo(70, 0);
    expect(out.subs[0].anchors.at(-1)!.out).toBeNull(); // no handle toward the removed part
    expect(out.subs[1].anchors[0].in).toBeNull();
    expect(out.subs[0].anchors[0]).toMatchObject({ x: 0, y: 50 });
  });

  it("a closed shape opens and keeps the arc that does not hold the click", () => {
    const m = model("M10 10L90 10L90 90L10 90Z" + "M50 0L50 100");
    const right = removeStretch(m, 0, stretchAt(m, 0, 1.5)!); // the right side, between the crossings top / bottom
    expect(text(right)).toBe("M50 90L10 90L10 10L50 10M50 0L50 100");
    const topLeft = removeStretch(m, 0, stretchAt(m, 0, 0.1)!); // wraps round the closing segment
    expect(text(topLeft)).toBe("M50 10L90 10L90 90L50 90M50 0L50 100");
  });

  it("the points of the stretch run from one crossing to the other", () => {
    const m = model(H + V1 + V2);
    const pts = stretchPoints(m, 0, stretchAt(m, 0, 0.5)!);
    expect(pts[0].x).toBeCloseTo(30, 6);
    expect(pts.at(-1)!.x).toBeCloseTo(70, 6);
    expect(pts.every((p) => Math.abs(p.y - 50) < 1e-9)).toBe(true);
  });
});

describe("the gesture", () => {
  const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
    ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null, ...mods });
  const both = { alt: true, shift: true };
  const start = (): EditorState => editorState(newSession(model(H + V1 + V2)));
  const click = (st: EditorState, i: PointerInput) => pointerUp(pointerDown(st, i));
  const body = (st: EditorState) => toPathData(st.session.model);

  it("Alt + Shift + click removes the stretch under the pointer as one undo step", () => {
    const st = click(start(), at(50, 50, both));
    expect(body(st)).toBe("M0 50L30 50M70 50L100 50" + V1 + V2);
    expect(st.session.undo).toHaveLength(1);
    expect(st.session.selection).toEqual([]);
  });

  it("Alt + click alone still removes the whole segment between the two anchors", () => {
    expect(body(click(start(), at(50, 50, { alt: true })))).toBe(V1 + V2);
  });

  it("with no crossing on a side, nothing happens and nothing is recorded", () => {
    const st = click(start(), at(10, 50, both));
    expect(body(st)).toBe(H + V1 + V2);
    expect(st.session.undo).toHaveLength(0);
  });

  it("holding both keys over a line shows the stretch; releasing, or leaving the line, hides it", () => {
    const st = start();
    const shown = hoverAt(st, at(50, 50, both));
    expect(shown.cutHint?.[0].x).toBeCloseTo(30, 6);
    expect(shown.cutHint?.at(-1)?.x).toBeCloseTo(70, 6);
    expect(hoverAt(shown, at(50, 50))?.cutHint).toBeNull();
    expect(hoverAt(shown, at(50, 80, both)).cutHint).toBeNull();
    expect(hoverAt(st, at(50, 50)) ).toBe(st); // nothing to show, nothing to clear: the same state
  });

  it("a click clears the hint", () => {
    const shown = hoverAt(start(), at(50, 50, both));
    expect(click(shown, at(50, 50, both)).cutHint ?? null).toBeNull();
  });
});
