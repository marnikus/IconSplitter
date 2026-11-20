// region.ts — the FILLED REGION under the pointer (2026-11-20). Alt + Shift
// over a closed area of a shape marks the subpath that paints it and a click
// cuts it out; this file is the pure half: which subpath is under a point, its
// outline as a polygon (for the red mark), and the cut itself.
//
// A cut changes NO geometry: the subpath's anchors are reversed and their
// handles swapped, so the shape is walked the other way. Under
// `fill-rule="nonzero"` (the default) that turns the area from painted into a
// hole, and under `fill-rule="evenodd"` a nested subpath is a hole already, so
// a flip would change nothing — the caller offers no cut there. A flip is its
// own inverse: cutting twice restores the file.

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

/**
 * The subpath index of the INNERMOST closed region whose interior holds `p`, or
 * null. Only closed subpaths with three or more anchors can paint an area, so
 * open lines are never regions.
 */
export function regionAt(m: PathModel, p: Pt): number | null {
  let best: { sub: number; area: number } | null = null;
  m.subs.forEach((s, sub) => {
    if (!s.closed || s.anchors.length < 3) return;
    const poly = regionPoints(s);
    if (poly.length < 3 || !insidePolygon(poly, p)) return;
    const area = regionArea(poly);
    if (best === null || area < best.area) best = { sub, area };
  });
  return best === null ? null : (best as { sub: number }).sub;
}

/**
 * The model with the region's winding flipped: the same anchors, walked the
 * other way, each one's handles exchanged. Null when the subpath cannot hold a
 * fill (open, or fewer than three anchors), so nothing is guessed at.
 */
export function cutRegion(m: PathModel, sub: number): PathModel | null {
  const s = m.subs[sub];
  if (s === undefined || !s.closed || s.anchors.length < 3) return null;
  const out = cloneModel(m);
  out.subs[sub].anchors = s.anchors.slice().reverse().map(flip);
  return out;
}

const flip = (a: Anchor): Anchor => ({
  x: a.x,
  y: a.y,
  in: a.out === null ? null : { x: a.out.x, y: a.out.y },
  out: a.in === null ? null : { x: a.in.x, y: a.in.y },
  mode: a.mode,
});
