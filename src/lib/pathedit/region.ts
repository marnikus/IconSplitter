// region.ts — the FILLED REGION under the pointer (2026-11-20). Alt + Shift
// over a closed area of a shape marks the subpath that paints it and a click
// cuts it out; this file is the pure half: which subpath is under a point, its
// outline as a polygon (for the red mark), and the cut itself.
//
// What a cut has to do is make the PAINT inside the region go away, and the
// fill rule decides how (2026-11-20, second round):
//
//   • nonzero, nested in another painting ring — the region's ring is walked the
//     other way (direction is winding), so the two cancel: the area becomes a
//     hole and only the region's own anchors move (a flip is its own inverse);
//   • nonzero, nothing painting around it — the same ring walked the other way
//     paints exactly the same pixels, so a reversed TWIN is added instead: the
//     two cancel and the area is empty;
//   • evenodd — direction means nothing, only the number of rings; ONE extra
//     ring toggles the parity, so the twin (same walk) makes the hole.
//
// "Already a hole" is answered the same way, by counting the rings and their
// directions at the point, so a hole is never offered again and a shape whose
// inner ring is drawn backwards is recognised as holed.

import { cloneModel, cubicAt, isLineSegment, segmentCubic, type Anchor, type PathModel, type Pt, type SubPath } from "./model";

/** A curve is flattened in this many straight pieces per segment (the mark is a hint, not geometry). */
const STEPS = 24;
const EPS = 1e-9;

/** The subpath as a closed polygon: its anchors, curves flattened. */
export function regionPoints(s: SubPath): Pt[] {
  const out: Pt[] = [];
  const count = s.closed ? s.anchors.length : s.anchors.length - 1;
  for (let seg = 0; seg < count; seg++) {
    const c = segmentCubic(s, seg);
    const start = s.anchors[seg];
    if (c === null) {
      out.push({ x: start.x, y: start.y });
      continue;
    }
    if (isLineSegment(s, seg)) {
      out.push({ x: c[0].x, y: c[0].y });
      continue;
    }
    for (let k = 0; k < STEPS; k++) {
      const p = cubicAt(c, k / STEPS);
      out.push({ x: p.x, y: p.y });
    }
  }
  return out;
}

/** Ray casting: is the point inside the polygon (a point ON an edge counts as outside)? */
export function insidePolygon(poly: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (pointOnSegment(a, b, p)) return false;
    const crosses = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointOnSegment(a: Pt, b: Pt, p: Pt): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-6 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) return false;
  return p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS
    && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}

/** The polygon's (unsigned) area: the smallest containing one is the region the pointer is really in. */
export function regionArea(poly: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) sum += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return Math.abs(sum) / 2;
}

/** One closed subpath that holds the point: which one, the way it is walked, and its area. */
interface Ring { sub: number; dir: 1 | -1; area: number }

/** The closed subpaths (3+ anchors) whose interior holds `p`, innermost first. */
function ringsAt(m: PathModel, p: Pt): Ring[] {
  const rings: Ring[] = [];
  m.subs.forEach((s, sub) => {
    if (!s.closed || s.anchors.length < 3) return;
    const poly = regionPoints(s);
    if (poly.length < 3 || !insidePolygon(poly, p)) return;
    rings.push({ sub, dir: signedArea(poly) < 0 ? -1 : 1, area: regionArea(poly) });
  });
  return rings.sort((a, b) => a.area - b.area);
}

/** Twice the signed area: the sign is the ring's direction (the winding it adds). */
function signedArea(poly: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) sum += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return sum;
}

/** Does the rule paint a point that these rings hold? Evenodd counts crossings, nonzero sums directions. */
function painted(rings: readonly Ring[], rule: "evenodd" | "nonzero"): boolean {
  if (rule === "evenodd") return rings.length % 2 === 1;
  return rings.reduce((sum, r) => sum + r.dir, 0) !== 0;
}

/**
 * The subpath index of the INNERMOST closed region that PAINTS `p`, or null.
 * Only closed subpaths with three or more anchors can paint an area, so open
 * lines are never regions; a point the fill rule leaves as a hole is not one
 * either (2026-11-20).
 */
export function regionAt(m: PathModel, p: Pt): number | null {
  const rings = ringsAt(m, p);
  const inner = rings[0];
  if (inner === undefined) return null;
  return painted(rings, m.subs[inner.sub].fillRule ?? "nonzero") ? inner.sub : null;
}

/**
 * The model with the region cut out — the paint inside it gone, everything else
 * as it was. Null when the subpath cannot hold a fill (open, or fewer than
 * three anchors), so nothing is guessed at. `p` is the point that was clicked:
 * it says what else paints there, which decides flip vs twin.
 */
export function cutRegion(m: PathModel, sub: number, p: Pt): PathModel | null {
  const s = m.subs[sub];
  if (s === undefined || !s.closed || s.anchors.length < 3) return null;
  const out = cloneModel(m);
  if ((s.fillRule ?? "nonzero") === "evenodd") {
    out.subs.push(twin(s, false)); // one more ring, same walk: the parity flips
    return out;
  }
  const around = ringsAt(m, p).filter((r) => r.sub !== sub).reduce((sum, r) => sum + r.dir, 0);
  if (around !== 0) out.subs[sub].anchors = reversed(s.anchors); // winding cancels the ring around it
  else out.subs.push(twin(s, true)); // nothing around it: the reversed twin cancels the ring itself
  return out;
}

/** The same ring, walked the other way; handles follow their anchors. */
const reversed = (anchors: readonly Anchor[]): Anchor[] => anchors.slice().reverse().map(flip);

/** A copy of the ring as its own subpath of the same object (optional reversed walk). */
function twin(s: SubPath, reverse: boolean): SubPath {
  const anchors = reverse ? reversed(s.anchors) : s.anchors.map((a) => ({ ...a, in: a.in && { ...a.in }, out: a.out && { ...a.out } }));
  return { anchors, closed: true, ...(s.owner === undefined ? {} : { owner: s.owner }), ...(s.fillRule === undefined ? {} : { fillRule: s.fillRule }) };
}

const flip = (a: Anchor): Anchor => ({
  x: a.x,
  y: a.y,
  in: a.out === null ? null : { x: a.out.x, y: a.out.y },
  out: a.in === null ? null : { x: a.in.x, y: a.in.y },
  mode: a.mode,
});
