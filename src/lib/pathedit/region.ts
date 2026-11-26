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

import { clipLayerIfPartial, clippedRegionAt } from "./boolean";
import { cloneModel, cubicAt, isLineSegment, segmentCubic, type Anchor, type PathModel, type Pt, type SubPath, isAreaRing } from "./model";

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

export function pointOnSegment(a: Pt, b: Pt, p: Pt): boolean {
  if (p.x < Math.min(a.x, b.x) - EPS || p.x > Math.max(a.x, b.x) + EPS) return false;
  if (p.y < Math.min(a.y, b.y) - EPS || p.y > Math.max(a.y, b.y) + EPS) return false;
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return Math.abs(cross) <= 1e-6 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
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
    if (!isAreaRing(s)) return;
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

/** The filling rings of ONE object at the point, innermost first, and the rule they are painted by. */
interface Layer { owner: number | undefined; rule: "evenodd" | "nonzero"; rings: Ring[] }

/** The objects that paint at the point: their filling rings, grouped, with the rule of the innermost. */
function layersAt(m: PathModel, rings: readonly Ring[]): Layer[] {
  const byOwner = new Map<number | undefined, Ring[]>();
  for (const r of rings) {
    if (!fills(m.subs[r.sub])) continue;
    const owner = m.subs[r.sub].owner;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), r]);
  }
  const layers: Layer[] = [];
  for (const [owner, list] of byOwner) {
    const rule = m.subs[list[0].sub].fillRule ?? "nonzero";
    if (paints(list, rule)) layers.push({ owner, rule, rings: list });
  }
  return layers;
}

/** Nonzero: the directions must not cancel; evenodd: an odd number of rings. */
function paints(rings: readonly Ring[], rule: "evenodd" | "nonzero"): boolean {
  if (rule === "evenodd") return rings.length % 2 === 1;
  return rings.reduce((sum, r) => sum + r.dir, 0) !== 0;
}

/**
 * The subpath index of the INNERMOST closed ring holding `p`, or null when
 * nothing paints there: that ring is the CUTTER (it may be a stroked outline,
 * `fill="none"`), and a point the fill leaves as a hole has nothing to cut.
 * Open lines are never regions.
 */
export function regionAt(m: PathModel, p: Pt): number | null {
  const rings = ringsAt(m, p);
  if (rings.length === 0 || layersAt(m, rings).length === 0) return null;
  if (rings.length === 1) return rings[0].sub;
  const areas = rings.map((r) => clippedRegionAt(m, r.sub, p)?.area ?? r.area);
  let best = 0;
  for (let i = 1; i < rings.length; i++) {
    const da = areas[i] - areas[best];
    if (da < -1e-2 || (Math.abs(da) <= 1e-2 && rings[i].area < rings[best].area)) best = i;
  }
  return rings[best].sub;
}

/**
 * The topmost subpath that paints at `p` among the allowed objects, or null:
 * a hole paints nothing, and `fill="none"` paints nothing, so neither is hit.
 */
export function paintedSubAt(m: PathModel, p: Pt, can: (owner: number | undefined) => boolean = () => true): number | null {
  const hits = layersAt(m, ringsAt(m, p)).filter((l) => can(l.owner));
  if (hits.length === 0) return null;
  const rank = (l: Layer) => (l.owner ?? -1) * 1e6 + Math.max(...l.rings.map((r) => r.sub));
  const top = hits.reduce((a, b) => (rank(b) >= rank(a) ? b : a));
  return top.rings[0].sub;
}

/** The cut as the knock-out helpers see it: which ring, at which point, walked which way. */
interface Cut { sub: number; walk: 1 | -1 }

/** What one painted object needs so its paint inside the region goes: copies of the ring, one flip, or a boolean clip. */
interface Knockout { owner: number | undefined; rule: "evenodd" | "nonzero"; count: number; reverse: boolean; flip?: number; clipped?: SubPath[] }

/**
 * The model with the region cut out: the paint inside the ring under `p` gone,
 * everything else as it was. Null when the subpath cannot be a cutter (open, or
 * fewer than three anchors) or when nothing paints there, so nothing is guessed
 * at. EVERY object that paints at `p` is knocked out — a hole through all the
 * layers, not only the innermost — and whatever those objects drew inside the
 * region goes with it (that area is being emptied anyway), so an earlier hole
 * inside the new region stays empty instead of being painted back.
 */
export function cutRegion(m: PathModel, sub: number, p: Pt): PathModel | null {
  const cutter = m.subs[sub];
  const atP = ringsAt(m, p);
  if (cutter === undefined || !isAreaRing(cutter) || layersAt(m, atP).length === 0) return null;
  const inside = regionPoints(cutter);
  const dropped = drawnInside(m, sub, inside);
  const plans = knockouts(m, atP.filter((r) => !dropped.has(r.sub)), { sub, dropped }, inside);
  return plans.length === 0 ? null : applyCut(m, cutter, dropped, plans);
}

/**
 * The subpaths that sit wholly inside the cutter on a painting object: they draw
 * inside the area being emptied, so they would only survive as paint that the
 * knock-out then has to cancel. A stroke-only outline is never dropped — its
 * `d` also draws the stroke, which the cut must leave alone.
 */
function drawnInside(m: PathModel, sub: number, cutter: readonly Pt[]): Set<number> {
  const dropped = new Set<number>();
  m.subs.forEach((s, i) => {
    if (i === sub || !fills(s) || !isAreaRing(s)) return;
    const poly = regionPoints(s);
    if (poly.length >= 3 && poly.every((q) => insidePolygon(cutter, q))) dropped.add(i);
  });
  return dropped;
}

/**
 * One knock-out per object that paints at the point: nonzero adds |winding|
 * copies of the cutter walked against the winding (or flips the cutter itself
 * when it is the only ring but one), evenodd adds one ring because only the
 * count matters.
 */
function knockouts(m: PathModel, rings: readonly Ring[], cut: { sub: number; dropped: ReadonlySet<number> }, inside: readonly Pt[]): Knockout[] {
  const walk = Math.sign(signedArea(inside)) as 1 | -1;
  return layersAt(m, rings).flatMap((layer) => {
    const clipped = clipLayerIfPartial(m, layer.owner, layer.rule, cut);
    if (clipped !== null) return [{ owner: layer.owner, rule: layer.rule, count: 0, reverse: false, clipped }];
    const plan = knockoutFor(layer, { sub: cut.sub, walk });
    return plan === null ? [] : [plan];
  });
}

/** The knock-out one painted object needs: one flipped ring, or copies walked against its winding. */
function knockoutFor(layer: Layer, cut: Cut): Knockout | null {
  const { owner, rule, rings } = layer;
  if (rule === "evenodd") return { owner, rule, count: 1, reverse: false };
  const winding = rings.reduce((n, r) => n + r.dir, 0);
  const mine = rings.find((r) => r.sub === cut.sub);
  if (mine !== undefined && winding === 2 * mine.dir) return { owner, rule, count: 0, reverse: false, flip: cut.sub };
  return { owner, rule, count: Math.abs(winding), reverse: -Math.sign(winding) !== cut.walk };
}

function replaceClipped(subs: SubPath[], plans: readonly Knockout[]): SubPath[] {
  const byOwner = new Map<number | undefined, SubPath[]>();
  for (const p of plans) if (p.clipped !== undefined) byOwner.set(p.owner, p.clipped);
  if (byOwner.size === 0) return subs;
  const placed = new Set<number | undefined>();
  return subs.flatMap((s) => {
    const rep = byOwner.get(s.owner);
    if (rep === undefined || !fills(s) || !isAreaRing(s)) return [s];
    if (placed.has(s.owner)) return [];
    placed.add(s.owner);
    return rep;
  });
}

/** Applies the plans: drops what was drawn inside, replaces clipped layers, flips or adds copies. */
function applyCut(m: PathModel, cutter: SubPath, dropped: ReadonlySet<number>, plans: readonly Knockout[]): PathModel {
  const out = cloneModel(m);
  const kept = new Map<number, number>(); // old index → index in the new list
  out.subs = out.subs.filter((_, i) => {
    if (dropped.has(i)) return false;
    kept.set(i, kept.size);
    return true;
  });
  for (const plan of plans) {
    if (plan.flip !== undefined) {
      const at = kept.get(plan.flip);
      if (at !== undefined) out.subs[at].anchors = reversed(cutter.anchors);
      continue;
    }
    for (let i = 0; i < plan.count; i++) out.subs.push(copyOf(cutter, plan));
  }
  out.subs = replaceClipped(out.subs, plans);
  return out;
}

/** The same ring, walked the other way; handles follow their anchors. */
const reversed = (anchors: readonly Anchor[]): Anchor[] => anchors.slice().reverse().map(flip);

/**
 * A copy of the ring as a subpath of `plan.owner` (the filled path it is cut
 * out of), keeping that path's fill rule. Handles follow their anchors.
 */
function copyOf(s: SubPath, plan: Knockout): SubPath {
  const anchors = plan.reverse ? reversed(s.anchors) : s.anchors.map((a) => ({ ...a, in: a.in && { ...a.in }, out: a.out && { ...a.out } }));
  return {
    anchors, closed: true, paints: true,
    ...(plan.owner === undefined ? {} : { owner: plan.owner }),
    ...(plan.rule === "evenodd" ? { fillRule: "evenodd" } : {}),
  };
}

const flip = (a: Anchor): Anchor => ({
  x: a.x,
  y: a.y,
  in: a.out === null ? null : { x: a.out.x, y: a.out.y },
  out: a.in === null ? null : { x: a.in.x, y: a.in.y },
  mode: a.mode,
});
