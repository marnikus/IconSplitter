// pathedit_region_cut.test.ts — Alt + Shift over a FILLED area in edit mode
// (2026-11-20): the closed subpath that paints the area under the pointer is
// marked red, and a click cuts it out — the geometry stays, only the winding
// flips, so the paint inside becomes a hole. Innermost region wins; open lines
// are never regions; a second click (or Ctrl+Z) puts it back.
import { describe, expect, it } from "vitest";
import { cutRegion, regionAt, regionPoints } from "../src/lib/pathedit/region";
import { editorState, hoverAt, pointerDown, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";

const model = (d: string) => fromPathData(d);
const text = (m: ReturnType<typeof fromPathData>) => toPathData(m);
const OUTER = "M10 10L90 10L90 90L10 90Z";
const INNER = "M40 40L60 40L60 60L40 60Z";

describe("which region is under the pointer", () => {
  it("is the closed subpath whose interior holds the point", () => {
    expect(regionAt(model(OUTER + INNER), { x: 50, y: 50 })).toBe(1);
    expect(regionAt(model(OUTER + INNER), { x: 20, y: 20 })).toBe(0);
  });

  it("is the INNERMOST one where they nest", () => {
    const m = model(OUTER + INNER + "M44 44L56 44L56 56L44 56Z");
    expect(regionAt(m, { x: 50, y: 50 })).toBe(2);
    expect(regionAt(m, { x: 42, y: 42 })).toBe(1);
  });

  it("is nothing outside every fill, and nothing on an open line", () => {
    expect(regionAt(model(OUTER), { x: 200, y: 200 })).toBeNull();
    expect(regionAt(model("M0 50L100 50" + "M50 0L50 100"), { x: 20, y: 80 })).toBeNull();
  });

  it("follows a CURVED outline, not its bounding box", () => {
    const ring = "M50 10C72 10 90 28 90 50C90 72 72 90 50 90C28 90 10 72 10 50C10 28 28 10 50 10Z";
    expect(regionAt(model(ring), { x: 50, y: 50 })).toBe(0);
    expect(regionAt(model(ring), { x: 12, y: 12 })).toBeNull(); // the corner the curve cuts off
  });

  it("its hint is the closed outline itself", () => {
    const pts = regionPoints(model(OUTER + INNER).subs[1]);
    expect(pts.length).toBeGreaterThanOrEqual(4);
    expect(pts[0]).toMatchObject({ x: 40, y: 40 });
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(60, 6);
  });
});

describe("cutting a region out", () => {
  it("reverses the subpath and nothing else — the geometry is kept", () => {
    const m = model(OUTER + INNER);
    const out = cutRegion(m, 1)!;
    expect(text(out)).toBe(OUTER + "M40 60L60 60L60 40L40 40Z");
    expect(text(m)).toBe(OUTER + INNER); // the given model is never touched
    expect(out.subs[1].closed).toBe(true);
  });

  it("a second cut puts it back (a winding flip is its own inverse)", () => {
    const once = cutRegion(model(OUTER + INNER), 1)!;
    expect(text(cutRegion(once, 1)!)).toBe(OUTER + INNER);
  });

  it("swaps each anchor's handles, so a curve keeps its drawn shape", () => {
    const curve = "M50 10C72 10 90 28 90 50C90 72 72 90 50 90C28 90 10 72 10 50C10 28 28 10 50 10Z";
    const out = cutRegion(model(curve), 0)!;
    const first = out.subs[0].anchors[0];
    expect(first.x).toBeCloseTo(10, 6); // the ring is walked the other way
    expect(first.y).toBeCloseTo(50, 6);
    // the outline is the same curve, walked the other way
    const before = regionPoints(model(curve).subs[0]);
    const after = regionPoints(out.subs[0]);
    expect(after.length).toBeCloseTo(before.length, 0);
    for (const p of before) {
      expect(after.some((q) => Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5)).toBe(true);
    }
  });

  it("an open subpath is not a region and cannot be cut", () => {
    expect(cutRegion(model("M0 50L100 50"), 0)).toBeNull();
  });
});

describe("the gesture", () => {
  const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
    ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null, ...mods });
  const both = { alt: true, shift: true };
  const start = (): EditorState => editorState(newSession(model(OUTER + INNER)));
  const click = (st: EditorState, i: PointerInput) => pointerUp(pointerDown(st, i));
  const body = (st: EditorState) => toPathData(st.session.model);

  it("Alt + Shift over a fill marks it red", () => {
    const shown = hoverAt(start(), at(50, 50, both));
    expect(shown.cutRegionHint?.length).toBeGreaterThanOrEqual(4);
    expect(shown.cutHint ?? null).toBeNull();
    expect(hoverAt(shown, at(50, 50))?.cutRegionHint ?? null).toBeNull(); // keys released
  });

  it("Alt + Shift + click cuts the marked region out as one undo step", () => {
    const st = click(start(), at(50, 50, both));
    expect(body(st)).toBe(OUTER + "M40 60L60 60L60 40L40 40Z");
    expect(st.session.undo).toHaveLength(1);
    expect(st.session.selection).toEqual([]);
    expect(st.cutRegionHint ?? null).toBeNull();
  });

  it("outside every fill nothing happens and nothing is recorded", () => {
    const st = click(start(), at(200, 200, both));
    expect(body(st)).toBe(OUTER + INNER);
    expect(st.session.undo).toHaveLength(0);
  });

  it("a plain click on the fill still selects, it never cuts", () => {
    const st = click(start(), at(50, 50));
    expect(body(st)).toBe(OUTER + INNER);
    expect(st.session.undo).toHaveLength(0);
  });

  it("Alt alone still removes a segment, and does not cut a fill", () => {
    const st = editorState(newSession(model("M0 50L100 50" + "M40 40L60 40L60 60L40 60Z")));
    const after = click(st, at(20, 50, { alt: true }));
    expect(toPathData(after.session.model)).not.toBe("");
    expect(after.session.model.subs.some((s) => s.closed)).toBe(true); // the fill is untouched
  });
});
