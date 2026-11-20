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
    const out = cutRegion(m, 1, { x: 50, y: 50 })!;
    expect(text(out)).toBe(OUTER + "M40 60L60 60L60 40L40 40Z");
    expect(text(m)).toBe(OUTER + INNER); // the given model is never touched
    expect(out.subs[1].closed).toBe(true);
  });

  it("a second cut puts it back (a winding flip is its own inverse)", () => {
    const once = cutRegion(model(OUTER + INNER), 1, { x: 50, y: 50 })!;
    expect(text(cutRegion(once, 1, { x: 50, y: 50 })!)).toBe(OUTER + INNER);
  });

  it("swaps each anchor's handles, so a curve keeps its drawn shape", () => {
    const curve = "M50 10C72 10 90 28 90 50C90 72 72 90 50 90C28 90 10 72 10 50C10 28 28 10 50 10Z";
    const out = cutRegion(model(curve), 0, { x: 50, y: 50 })!;
    // a lone ring is holed by its reversed TWIN (2026-11-20), so the curve is there
    expect(out.subs).toHaveLength(2);
    const first = out.subs[1].anchors[0];
    expect(first.x).toBeCloseTo(10, 6); // the twin is walked the other way
    expect(first.y).toBeCloseTo(50, 6);
    const before = regionPoints(model(curve).subs[0]);
    const after = regionPoints(out.subs[1]);
    expect(after.length).toBeCloseTo(before.length, 0);
    for (const p of before) {
      expect(after.some((q) => Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5)).toBe(true);
    }
  });

  it("an open subpath is not a region and cannot be cut", () => {
    expect(cutRegion(model("M0 50L100 50"), 0, { x: 50, y: 50 })).toBeNull();
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

// 2026-11-20 (second round): the reported bug. A filled area that is a LONE
// closed subpath (the common case: one `<path>`, one ring) cannot be holed by
// reversing it — the same ring walked the other way paints exactly the same
// pixels — and under `fill-rule="evenodd"` direction means nothing at all. The
// cut therefore has to subtract the region: a reversed twin for nonzero, ONE
// extra ring for evenodd. `regionAt` answers "is this point painted", so a hole
// is not offered again and the red mark disappears after the cut.
describe("the cut has to make the paint go away", () => {
  /** Nonzero winding of the model at `p`: 0 = a hole. */
  const winding = (d: string, p: { x: number; y: number }): number =>
    fromPathData(d).subs.reduce((sum, s) => {
      if (!s.closed || s.anchors.length < 3) return sum;
      const poly = regionPoints(s);
      let area = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
      const inside = regionPoints(s).length > 2 && insideOf(poly, p);
      return inside ? sum + Math.sign(area) : sum;
    }, 0);
  const insideOf = (poly: { x: number; y: number }[], p: { x: number; y: number }): boolean => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (poly[i].y > p.y !== poly[j].y > p.y && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) hit = !hit;
    }
    return hit;
  };
  const centre = { x: 50, y: 50 };
  const lone = model(OUTER);

  it("a LONE ring is cancelled by a reversed twin, not reversed in place", () => {
    const out = cutRegion(lone, 0, centre)!;
    expect(text(out).startsWith(OUTER)).toBe(true);     // the drawn ring is untouched
    expect(out.subs).toHaveLength(2);                    // the twin is the subtraction
    expect(winding(text(lone), centre)).toBe(1);         // painted before…
    expect(winding(text(out), centre)).toBe(0);          // …a hole after
  });

  it("a nested ring is still flipped in place — no extra subpath", () => {
    const out = cutRegion(model(OUTER + INNER), 1, centre)!;
    expect(out.subs).toHaveLength(2);
    expect(winding(text(out), centre)).toBe(0);
    expect(winding(text(out), { x: 20, y: 20 })).toBe(1); // the surrounding fill stays
  });

  it("evenodd is holed by ONE extra ring — its direction is irrelevant", () => {
    const m = fromPathData(OUTER);
    m.subs[0].fillRule = "evenodd";
    const out = cutRegion(m, 0, centre)!;
    expect(out.subs).toHaveLength(2);
    expect(text({ subs: [out.subs[0]] })).toBe(OUTER);    // same ring, same walk
  });

  it("an evenodd outline already holed there is not offered", () => {
    const m = fromPathData(OUTER + INNER);
    m.subs.forEach((s) => { s.fillRule = "evenodd"; });
    expect(regionAt(m, centre)).toBeNull();              // the inner ring is the hole
    expect(regionAt(m, { x: 20, y: 20 })).toBe(0);       // the ring between them paints
    expect(cutRegion(m, 0, { x: 20, y: 20 })).not.toBeNull();
  });

  it("a nonzero ring drawn backwards is a hole already, and is not offered", () => {
    const m = fromPathData(OUTER + "M40 40L40 60L60 60L60 40Z"); // outer +1, inner −1
    expect(regionAt(m, centre)).toBeNull();
    expect(regionAt(m, { x: 20, y: 20 })).toBe(0);
  });

  it("after the cut the region is no longer marked — the hole is not offered again", () => {
    const st0 = editorState(newSession(lone));
    const both = { alt: true, shift: true };
    const at = (x: number, y: number): PointerInput => ({ p: { x, y }, ctrl: false, alt: both.alt, shift: both.shift, unitsPerPx: 0.1, target: null });
    const marked = hoverAt(st0, at(50, 50));
    expect(marked.cutRegionHint?.length).toBeGreaterThanOrEqual(4);
    const cut = pointerUp(pointerDown(marked, at(50, 50)));
    expect(cut.session.undo).toHaveLength(1);
    expect(winding(toPathData(cut.session.model), centre)).toBe(0);
    expect(hoverAt(cut, at(50, 50)).cutRegionHint ?? null).toBeNull();
  });
});
