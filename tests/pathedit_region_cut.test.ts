// pathedit_region_cut.test.ts — Alt + Shift over a FILLED area in edit mode
// (2026-11-20): the closed subpath that paints the area under the pointer is
// marked red, and a click cuts it out — the geometry stays, only the winding
// flips, so the paint inside becomes a hole. Innermost region wins; open lines
// are never regions; a second click (or Ctrl+Z) puts it back.
import { describe, expect, it } from "vitest";
import { cutRegion, regionAt, regionPoints } from "../src/lib/pathedit/region";
import { editorState, hoverAt, pointerDown, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData, type PathModel } from "../src/lib/pathedit/model";
import { loadObjects } from "../src/lib/pathedit/objects";
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

  it("a hole is not cut twice: the second click is refused, undo is the way back", () => {
    const once = cutRegion(model(OUTER + INNER), 1, { x: 50, y: 50 })!;
    expect(text(once)).toBe(OUTER + "M40 60L60 60L60 40L40 40Z");
    expect(cutRegion(once, 1, { x: 50, y: 50 })).toBeNull(); // already a hole
    expect(regionAt(once, { x: 50, y: 50 })).toBeNull();
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

// 2026-11-20 (third round): the real map pin the user sent. Its middle circle is
// a closed ring of a `fill="none"` stroked path — it paints NOTHING, so it must
// not cancel the pin's fill in the winding sum (the bug: the area read as a hole
// and was never marked), and it must still work as the CUTTER: the click has to
// knock that ring out of the FILLED path behind it.
const PIN = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 384 384">
<path fill="#28ACEE" d="M65 168c0-27 15-59 36-76 22-17 50-21 73-18 28 2 52 14 65 34 14 23 19 45 10 71-8 25-20 46-34 66l-37 60-5 7q-5 7-10 0l-6-5-67-77q-25-29-25-62zM208 65c10-14 29-21 44-23 28-4 53 6 66 26 15 23 16 57 0 85-17 25-34 41-56 66q-7 7-12-1l-3-6q-1-3 1-7c13-28 17-49 10-76-7-24-23-42-48-54q-7-4-2-10z"/>
<path fill="none" stroke="#000" stroke-width="5.4" stroke-linecap="round" d="M151.58 122.6C131.58 129.6 114.58 150.6 118.58 173.6C121.58 195.6 143.58 209.6 165.58 206.6C188.58 203.6 206.58 179.6 204.58 156.6C201.58 129.6 175.58 114.6 151.58 122.6Z"/>
</svg>`;

describe("an unfilled closed outline is a cutter, not a hole (the map pin)", () => {
  const m = loadObjects(PIN, []);
  const centre = { x: 161, y: 165 };
  /** Nonzero winding of the FILLED rings only — what the eye sees. */
  const paint = (model: PathModel, p: { x: number; y: number }): number =>
    model.subs.reduce((sum, s) => {
      if (s.paints === false || !s.closed || s.anchors.length < 3) return sum;
      return s.anchors.length > 0 && inside(s, p) ? sum + Math.sign(signedOf(s)) : sum;
    }, 0);
  function inside(s: { anchors: unknown }, p: { x: number; y: number }): boolean {
    const poly = regionPoints(s as Parameters<typeof regionPoints>[0]);
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (poly[i].y > p.y !== poly[j].y > p.y && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) hit = !hit;
    }
    return hit;
  }
  function signedOf(s: Parameters<typeof regionPoints>[0]): number {
    const poly = regionPoints(s);
    let sum = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) sum += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    return sum;
  }

  it("reads the fill rule and the fill of each path, not just its rings", () => {
    expect(m.subs[0].paints).not.toBe(false);      // the pin body fills
    expect(m.subs[2].paints).toBe(false);          // the circle is stroked only
    expect(m.subs[2].closed).toBe(true);
  });

  it("marks the circle, because the pin behind it still paints there", () => {
    expect(paint(m, centre)).not.toBe(0);
    const sub = regionAt(m, centre);
    expect(sub).toBe(2);
    expect(regionAt(m, { x: 340, y: 30 })).toBeNull(); // nothing paints outside
  });

  it("the click knocks the ring out of the FILLED path, leaving the other path alone", () => {
    const out = cutRegion(m, 2, centre)!;
    expect(paint(out, centre)).toBe(0);            // a hole in the pin
    expect(paint(out, { x: 90, y: 200 })).not.toBe(0); // the rest of the pin keeps its fill
    expect(out.subs.slice(0, m.subs.length).map((s) => s.paints)).toEqual(m.subs.map((s) => s.paints));
    const added = out.subs[m.subs.length];
    expect(added.owner).toBe(0);                   // written into the pin's own `d`
    expect(added.paints).not.toBe(false);
    expect(regionAt(out, centre)).toBeNull();      // a hole is not offered again
  });

  it("a stroked ring with nothing filled behind it is not a cutter", () => {
    const strokeOnly = loadObjects('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" fill="none" stroke="#000"/></svg>', []);
    expect(regionAt(strokeOnly, { x: 50, y: 50 })).toBeNull();
    expect(cutRegion(strokeOnly, 0, { x: 50, y: 50 })).toBeNull();
  });

  it("`fill` and `fill-rule` are inherited from a group", () => {
    const g = loadObjects('<svg viewBox="0 0 100 100"><g fill="none"><path d="M10 10L90 10L90 90L10 90Z"/></g>'
      + '<g fill="#000" fill-rule="evenodd"><path d="M10 10L90 10L90 90L10 90Z"/></g></svg>', []);
    expect(g.subs[0].paints).toBe(false);
    expect(g.subs[1].paints).not.toBe(false);
    expect(g.subs[1].fillRule).toBe("evenodd");
  });
});

// 2026-11-20 (fourth round), the user's two follow-ups:
//   1. "after the hole made next hole created return back the previous hole back
//      as fill … but should leave previous hole as it was" — a new cut added
//      copies of its own ring to a path that already had holes, and the winding
//      of a big containing ring re-painted them;
//   2. "unable to make hole if it is several closed shapes one inside another" —
//      the hole was knocked out of the INNERMOST painted object only, so an
//      outer object of the same colour still painted the area: white on white,
//      no visible hole.
// A cut now subtracts its region from EVERY painting object at that point, drops
// whatever those objects drew INSIDE the region (it is being emptied anyway) and
// never touches paint outside it — so holes compose.
describe("a cut subtracts from every painted layer, and only inside its region", () => {
  /** What the eye sees: the nonzero winding of every filling subpath at `p`. */
  const paint = (model: PathModel, p: { x: number; y: number }): number =>
    model.subs.reduce((sum, s) => {
      if (s.paints === false || !s.closed || s.anchors.length < 3) return sum;
      const poly = regionPoints(s);
      let area = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if (poly[i].y > p.y !== poly[j].y > p.y && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) hit = !hit;
      }
      return hit ? sum + Math.sign(area) : sum;
    }, 0);
  const CUTTER = "M40 40L60 40L60 60L40 60Z";
  const centre = { x: 50, y: 50 };

  /** A model of several objects, as the file gives it: one path per ring. */
  const objects = (...rings: { d: string; fill?: string }[]): PathModel => {
    const subs = rings.flatMap((r, owner) => fromPathData(r.d, owner).subs);
    subs.forEach((s, i) => { if (rings[i].fill === "none") s.paints = false; });
    return { subs };
  };

  it("knocks the region out of EVERY painted layer, not just the innermost", () => {
    const m = objects({ d: OUTER }, { d: "M20 20L80 20L80 80L20 80Z" }, { d: CUTTER, fill: "none" });
    expect(paint(m, centre)).toBe(2);                 // two white layers over each other
    const out = cutRegion(m, 2, centre)!;
    expect(paint(out, centre)).toBe(0);               // one hole through both
    expect(paint(out, { x: 15, y: 15 })).toBe(1);     // outside the cutter the layers stay
  });

  it("keeps an earlier hole when a later cut contains it", () => {
    const first = cutRegion(objects({ d: OUTER }, { d: CUTTER, fill: "none" }), 1, centre)!;
    expect(paint(first, centre)).toBe(0);             // hole made
    expect(paint(first, { x: 20, y: 20 })).toBe(1);   // the rest of the ring paints
    // Cut the whole ring next: its area is emptied anyway, so the small hole
    // must stay empty instead of being painted back by the bigger ring.
    const second = cutRegion(first, 0, { x: 20, y: 20 })!;
    expect(paint(second, centre)).toBe(0);
    expect(paint(second, { x: 20, y: 20 })).toBe(0);
    expect(paint(second, { x: 120, y: 120 })).toBe(0); // nothing outside was painted either
  });

  it("two disjoint holes add up and neither one refills", () => {
    const m = objects({ d: "M0 0L200 0L200 200L0 200Z" }, { d: CUTTER, fill: "none" }, { d: "M120 120L160 120L160 160L120 160Z", fill: "none" });
    const a = cutRegion(m, 1, centre)!;
    const b = cutRegion(a, 2, { x: 140, y: 140 })!;
    expect(paint(b, centre)).toBe(0);
    expect(paint(b, { x: 140, y: 140 })).toBe(0);
    expect(paint(b, { x: 100, y: 20 })).toBe(1);
  });

  it("drops what was drawn inside the cut, so nothing survives it in pieces", () => {
    const m = objects({ d: "M0 0L200 0L200 200L0 200Z" }, { d: "M45 45L55 45L55 55L45 55Z" }, { d: CUTTER, fill: "none" });
    const out = cutRegion(m, 2, centre)!;
    expect(paint(out, centre)).toBe(0);
    expect(out.subs.filter((s) => s.owner === 1)).toHaveLength(0); // the dot inside the cut is gone
  });

  it("three nested rings of one object: cutting the middle keeps the inner hole", () => {
    const m = objects({ d: "M0 0L100 0L100 100L0 100Z" }, { d: "M20 20L80 20L80 80L20 80Z" }, { d: "M35 35L65 35L65 65L35 65Z" });
    const inner = cutRegion(m, 2, centre)!;
    expect(paint(inner, centre)).toBe(0);
    const middle = cutRegion(inner, 1, { x: 25, y: 25 })!;
    expect(paint(middle, { x: 25, y: 25 })).toBe(0);
    expect(paint(middle, centre)).toBe(0);            // the inner hole is still a hole
    expect(paint(middle, { x: 10, y: 10 })).toBe(1);  // the outermost ring is untouched
  });
});
