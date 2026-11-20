// region.ts — the REGION under the pointer (2026-11-20). Alt + Shift over a
// closed outline marks that ring and a click CUTS IT OUT of the paint behind it;
// this file is the pure half: which ring is under a point, its outline as a
// polygon (the red mark), and the cut itself.
//
// What has to change is the PAINT, and two things decide it:
//
//   • a ring only counts as paint when its shape actually fills — `fill="none"`
//     (its own or a group's) paints nothing, so a stroked circle inside a filled
//     pin does NOT make that middle a hole. It is a CUTTER instead: clicking it
//     knocks the ring out of the filled path behind it (third round; the bug was
//     counting every ring, so the pin's middle read as a hole and was never
//     offered);
//   • nonzero counts directions, evenodd counts rings.
//
// Under nonzero a point is painted when the directions of the filling rings
// containing it do not sum to 0, and the cut has to make that sum 0 without
// touching anything else: a ring nested in one other filling ring is simply
// walked the other way (its own anchors, nothing added); anything else gets
// copies of the cutter ring added to the FILLED path's own `d`, walked against
// the sum. Under evenodd one added ring flips the parity, which is the same
// knock-out. Points that are already holes are not regions, so a hole is never
// offered twice.

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

/** Does this ring paint? `fill="none"` (own or inherited) says no. */
const fills = (s: SubPath): boolean => s.paints !== false;

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

/** The rings that actually fill, and the rule of the innermost of them (a group's rule is inherited). */
function paintAt(m: PathModel, rings: readonly Ring[]): { filled: Ring[]; rule: "evenodd" | "nonzero"; owner: number | undefined } | null {
  const filled = rings.filter((r) => fills(m.subs[r.sub]));
  const inner = filled[0];
  if (inner === undefined) return null;
  const sameObject = filled.filter((r) => m.subs[r.sub].owner === m.subs[inner.sub].owner);
  return { filled: sameObject, rule: m.subs[inner.sub].fillRule ?? "nonzero", owner: m.subs[inner.sub].owner };
}

/** Nonzero: the directions must not cancel; evenodd: an odd number of rings. */
function painted(paint: { filled: readonly Ring[]; rule: "evenodd" | "nonzero" }): boolean {
  if (paint.rule === "evenodd") return paint.filled.length % 2 === 1;
  return paint.filled.reduce((sum, r) => sum + r.dir, 0) !== 0;
}

/**
 * The subpath index of the INNERMOST closed ring holding `p`, or null when
 * nothing paints there: that ring is the CUTTER (it may be a stroked outline,
 * `fill="none"`), and a point the fill leaves as a hole has nothing to cut.
 * Open lines are never regions.
 */
export function regionAt(m: PathModel, p: Pt): number | null {
  const rings = ringsAt(m, p);
  const paint = paintAt(m, rings);
  const inner = rings[0];
  if (paint === null || inner === undefined || !painted(paint)) return null;
  return inner.sub;
}

/**
 * The model with the region cut out: the paint inside the ring under `p` gone,
 * everything else as it was. Null when the subpath cannot be a cutter (open, or
 * fewer than three anchors) or when nothing paints there, so nothing is guessed
 * at. `p` is the point that was clicked — it says what fills there and how.
 */
export function cutRegion(m: PathModel, sub: number, p: Pt): PathModel | null {
  const cutter = m.subs[sub];
  if (cutter === undefined || !cutter.closed || cutter.anchors.length < 3) return null;
  const rings = ringsAt(m, p);
  const paint = paintAt(m, rings);
  if (paint === null || !painted(paint)) return null;
  const out = cloneModel(m);
  const targets = paint.filled;
  if (paint.rule === "evenodd") {
    out.subs.push(copyOf(cutter, false, paint.owner)); // one more ring of that object: the parity flips
    return out;
  }
  const sum = targets.reduce((n, r) => n + r.dir, 0);
  const mine = targets.find((r) => r.sub === sub);
  if (mine !== undefined && sum === 2 * mine.dir) {
    out.subs[sub].anchors = reversed(cutter.anchors); // it cancels the one ring around it: no extra geometry
    return out;
  }
  // Nothing to cancel against in place (a lone pin body) or several rings: add
  // copies of the cutter, walked against them, into the FILLED path's own `d`.
  const want = -Math.sign(sum) as 1 | -1;
  const walk = Math.sign(signedArea(regionPoints(cutter))) as 1 | -1; // the cutter's own direction
  for (let i = 0; i < Math.abs(sum); i++) out.subs.push(copyOf(cutter, want !== walk, paint.owner));
  return out;
}

/** The same ring, walked the other way; handles follow their anchors. */
const reversed = (anchors: readonly Anchor[]): Anchor[] => anchors.slice().reverse().map(flip);

/**
 * A copy of the ring as a subpath of `owner` (the filled path it is cut out of),
 * walked either way. Handles follow their anchors, so a curve keeps its shape.
 */
function copyOf(s: SubPath, reverse: boolean, owner: number | undefined): SubPath {
  const anchors = reverse ? reversed(s.anchors) : s.anchors.map((a) => ({ ...a, in: a.in && { ...a.in }, out: a.out && { ...a.out } }));
  return { anchors, closed: true, paints: true, ...(owner === undefined ? {} : { owner }), ...(s.fillRule === undefined ? {} : { fillRule: s.fillRule }) };
}

const flip = (a: Anchor): Anchor => ({
  x: a.x,
  y: a.y,
  in: a.out === null ? null : { x: a.out.x, y: a.out.y },
  out: a.in === null ? null : { x: a.in.x, y: a.in.y },
  mode: a.mode,
});
