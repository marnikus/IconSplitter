// fill.ts — a filled shape and its holes as ONE piece (2026-11-20, fifth
// round). After a boolean cut (`cutRegion`), or in any compound `<path>` that
// has holes, the hole rings live as closed subpaths of the same filled object
// (`owner`). Selecting or dragging the fill has to carry every hole of that
// filled piece with it — leaving a hole behind turns it into a stationary
// inverted mask — while keeping separate disjoint shapes in the same `<path>`
// (such as outlined letters) independent, and open / `fill="none"` lines as
// single lines. Pure.

import { isAreaRing } from "./model";
import type { AnchorRef, PathModel, Pt, SubPath } from "./model";
import { insidePolygon, paintedSubAt, pointOnSegment, regionPoints } from "./region";
import type { EditSession } from "./session";

const EPS = 1e-9;

interface RingPoly { sub: number; poly: Pt[]; x0: number; y0: number; x1: number; y1: number }

function ringPoly(sub: number, s: SubPath): RingPoly | null {
  if (s.paints === false || !isAreaRing(s)) return null;
  const poly = regionPoints(s);
  if (poly.length < 3) return null;
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  return { sub, poly, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const insideOrOn = (poly: readonly Pt[], p: Pt): boolean =>
  insidePolygon(poly, p) || poly.some((a, i) => pointOnSegment(a, poly[(i + 1) % poly.length], p));

/** Strict interior crossing of segments u→v and p→q (touching an endpoint alone does not glue tiles). */
function segmentsCross(u: Pt, v: Pt, p: Pt, q: Pt): boolean {
  if (Math.max(p.x, q.x) <= Math.min(u.x, v.x) || Math.min(p.x, q.x) >= Math.max(u.x, v.x)) return false;
  if (Math.max(p.y, q.y) <= Math.min(u.y, v.y) || Math.min(p.y, q.y) >= Math.max(u.y, v.y)) return false;
  const rx = v.x - u.x, ry = v.y - u.y, sx = q.x - p.x, sy = q.y - p.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const r = ((p.x - u.x) * sy - (p.y - u.y) * sx) / den;
  const w = ((p.x - u.x) * ry - (p.y - u.y) * rx) / den;
  return r > EPS && r < 1 - EPS && w > EPS && w < 1 - EPS;
}

function edgesCross(a: readonly Pt[], b: readonly Pt[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i], a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a0, a1, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

const apart = (a: RingPoly, b: RingPoly): boolean =>
  b.x1 < a.x0 - EPS || b.x0 > a.x1 + EPS || b.y1 < a.y0 - EPS || b.y0 > a.y1 + EPS;

/** Two closed filling rings share interior area: nested (a hole), crossing, or twin copies. */
function ringsShareArea(a: RingPoly, b: RingPoly): boolean {
  if (apart(a, b)) return false;
  if (insidePolygon(b.poly, a.poly[0]) || insidePolygon(a.poly, b.poly[0])) return true;
  if (edgesCross(a.poly, b.poly)) return true;
  if (a.poly.some((p) => insidePolygon(b.poly, p)) || b.poly.some((p) => insidePolygon(a.poly, p))) return true;
  return b.poly.every((p) => insideOrOn(a.poly, p)) || a.poly.every((p) => insideOrOn(b.poly, p));
}

/** The connected component of `start` among `rings` under area overlap. */
function connectedSubs(rings: readonly RingPoly[], start: number): Set<number> {
  const group = new Set<number>([start]);
  const queue = rings.filter((r) => r.sub === start);
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const r of rings) {
      if (!group.has(r.sub) && ringsShareArea(cur, r)) { group.add(r.sub); queue.push(r); }
    }
  }
  return group;
}

/**
 * Every anchor that moves as one piece with subpath `sub`: for an open or
 * `fill="none"` line just `sub` itself; for a closed filled shape, `sub` plus
 * every hole / nested / overlapping closed ring of the same object (`owner`).
 */
export function pieceAnchors(m: PathModel, sub: number): AnchorRef[] {
  const target = m.subs[sub];
  if (target === undefined) return [];
  const start = ringPoly(sub, target);
  if (start === null) return target.anchors.map((_, i) => ({ sub, i }));
  const sameOwner = m.subs.flatMap((s, k) => {
    const r = s.owner === target.owner ? ringPoly(k, s) : null;
    return r === null ? [] : [r];
  });
  const group = connectedSubs(sameOwner, sub);
  return m.subs.flatMap((s, k) => (group.has(k) ? s.anchors.map((_, i) => ({ sub: k, i })) : []));
}

/**
 * The anchors of the painted fill piece under `p` when a plain press may drag
 * it, or null: either the picked `target` paints there, or an already-editable
 * shape does (unowned models and synthetic events where `target` is null).
 */
export function paintedPieceAt(s: EditSession, p: Pt, target: number | null): AnchorRef[] | null {
  const can = target !== null
    ? (o: number | undefined) => o === target
    : (o: number | undefined) => o === undefined || s.objects.includes(o);
  const sub = paintedSubAt(s.model, p, can);
  if (sub === null) return null;
  const refs = pieceAnchors(s.model, sub);
  return refs.length > 0 ? refs : null;
}
