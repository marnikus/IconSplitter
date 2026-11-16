// hit.ts — what the pointer is over, in the path's own units (2026-11-06).
// Radii come in already converted from screen pixels, so targets stay the same
// size at any zoom. Order: a SELECTED anchor's handles, then anchors, then
// segments (a band around the centre line, not the drawn stroke). Shift-snap
// looks at the model as it was at drag start and never at the dragged anchor
// or its own two segments. Pure.

import { cubicAt, isLineSegment, nextIndex, prevIndex, segmentCubic, type AnchorRef, type PathModel, type Pt, type SubPath } from "./model";

export interface HitRadii { anchor: number; handle: number; segment: number }

export type Hit =
  | { kind: "handle"; ref: AnchorRef; side: "in" | "out" }
  | { kind: "anchor"; ref: AnchorRef }
  | { kind: "segment"; sub: number; i: number; t: number; pt: Pt }
  | { kind: "none" };

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The nearest point of segment i to `p`: projection on a line, sampling + refinement on a curve. */
export function nearestOnSegment(sub: SubPath, i: number, p: Pt): { t: number; pt: Pt; d: number } | null {
  const c = segmentCubic(sub, i);
  if (c === null) return null;
  if (isLineSegment(sub, i)) {
    const dx = c[3].x - c[0].x, dy = c[3].y - c[0].y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - c[0].x) * dx + (p.y - c[0].y) * dy) / len2));
    const pt = { x: c[0].x + dx * t, y: c[0].y + dy * t };
    return { t, pt, d: dist(pt, p) };
  }
  return refine(c, p);
}

function refine(c: Pt[], p: Pt): { t: number; pt: Pt; d: number } {
  const N = 48;
  let best = 0;
  for (let k = 1; k <= N; k++) if (dist(cubicAt(c, k / N), p) < dist(cubicAt(c, best / N), p)) best = k;
  let lo = Math.max(0, (best - 1) / N), hi = Math.min(1, (best + 1) / N);
  for (let k = 0; k < 30; k++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (dist(cubicAt(c, a), p) < dist(cubicAt(c, b), p)) hi = b; else lo = a;
  }
  const t = (lo + hi) / 2;
  const pt = cubicAt(c, t);
  return { t, pt, d: dist(pt, p) };
}

/** The selected anchors' handles within reach (handles only exist on screen for the selection). */
function handleHit(m: PathModel, p: Pt, r: number, selected: readonly AnchorRef[]): Hit | null {
  for (const ref of selected) {
    const a = m.subs[ref.sub]?.anchors[ref.i];
    for (const side of ["out", "in"] as const) {
      const h = a?.[side];
      if (h && dist(h, p) <= r) return { kind: "handle", ref, side };
    }
  }
  return null;
}

/** Which subpaths can be hit (the selected objects); all when absent. */
export type Editable = (sub: number) => boolean;
const ALL: Editable = () => true;

function anchorHit(m: PathModel, p: Pt, r: number, can: Editable): Hit | null {
  let best: { ref: AnchorRef; d: number } | null = null;
  m.subs.forEach((s, sub) => s.anchors.forEach((a, i) => {
    if (!can(sub)) return;
    const d = dist(a, p);
    if (d <= r && (best === null || d < best.d)) best = { ref: { sub, i }, d };
  }));
  return best === null ? null : { kind: "anchor", ref: (best as { ref: AnchorRef }).ref };
}

function segmentHit(m: PathModel, p: Pt, r: number, can: Editable): Hit | null {
  let best: Extract<Hit, { kind: "segment" }> | null = null;
  let bestD = Infinity;
  m.subs.forEach((s, sub) => s.anchors.forEach((_, i) => {
    if (!can(sub)) return;
    const n = nearestOnSegment(s, i, p);
    if (n !== null && n.d <= r && n.d < bestD) { bestD = n.d; best = { kind: "segment", sub, i, t: n.t, pt: n.pt }; }
  }));
  return best;
}

/** What is under `p`: a selected point's handle wins over an anchor, an anchor over a segment. */
/** How to look: the radii, the selected anchors (their handles are live) and which subpaths may be hit. */
export interface HitQuery { radii: HitRadii; selected: readonly AnchorRef[]; editable?: Editable }

export function hitTest(m: PathModel, p: Pt, q: HitQuery): Hit {
  const can = q.editable ?? ALL;
  return handleHit(m, p, q.radii.handle, q.selected) ?? anchorHit(m, p, q.radii.anchor, can)
    ?? segmentHit(m, p, q.radii.segment, can) ?? { kind: "none" };
}

export type Snap =
  | { kind: "end"; pt: Pt; ref: AnchorRef }
  | { kind: "segment"; pt: Pt; sub: number; i: number };

const sameRef = (a: AnchorRef, b: AnchorRef): boolean => a.sub === b.sub && a.i === b.i;

/** The dragged anchor's own two segments: snapping onto them would snap to itself. */
function ownSegment(base: PathModel, moving: AnchorRef, sub: number, i: number): boolean {
  if (sub !== moving.sub) return false;
  return i === moving.i || prevIndex(base.subs[sub], moving.i) === i;
}

function endSnap(base: PathModel, p: Pt, moving: AnchorRef, r: number): Snap | null {
  let best: Snap | null = null;
  let bestD = Infinity;
  base.subs.forEach((s, sub) => s.anchors.forEach((a, i) => {
    const d = dist(a, p);
    if (!sameRef({ sub, i }, moving) && d <= r && d < bestD) { bestD = d; best = { kind: "end", pt: { x: a.x, y: a.y }, ref: { sub, i } }; }
  }));
  return best;
}

function onSegmentSnap(base: PathModel, p: Pt, moving: AnchorRef, r: number): Snap | null {
  let best: Snap | null = null;
  let bestD = Infinity;
  base.subs.forEach((s, sub) => s.anchors.forEach((_, i) => {
    if (nextIndex(s, i) === null || ownSegment(base, moving, sub, i)) return;
    const n = nearestOnSegment(s, i, p);
    if (n !== null && n.d <= r && n.d < bestD) { bestD = n.d; best = { kind: "segment", pt: n.pt, sub, i }; }
  }));
  return best;
}

/** Shift-drag: an anchor of the drag-start model first, else the nearest point on a segment. */
export function snapPoint(base: PathModel, p: Pt, moving: AnchorRef, r: number): Snap | null {
  return endSnap(base, p, moving, r) ?? onSegmentSnap(base, p, moving, r);
}

/** Every anchor inside the marquee. */
export function anchorsInRect(m: PathModel, a: Pt, b: Pt): AnchorRef[] {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return m.subs.flatMap((s, sub) => s.anchors.flatMap((p, i) => (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 ? [{ sub, i }] : [])));
}

/** A closed subpath as a polygon (each segment sampled), for inside tests. */
function outlinePoints(s: SubPath): Pt[] {
  const pts: Pt[] = [];
  s.anchors.forEach((_, i) => {
    const c = segmentCubic(s, i);
    if (c === null) return;
    for (let k = 0; k < 8; k++) pts.push(cubicAt(c, k / 8));
  });
  return pts;
}

/** Even-odd: is `p` inside the closed subpath? */
function inside(s: SubPath, p: Pt): boolean {
  if (!s.closed || s.anchors.length < 2) return false;
  const pts = outlinePoints(s);
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * The object (icon shape) a click picks, by geometry — a thin stroke or a
 * shape without fill is still easy to pick (2026-11-06): within the anchor /
 * segment band of any shape, else inside a closed shape that is not selected
 * (the topmost — last drawn — first). Null on empty space.
 */
export function objectAt(m: PathModel, p: Pt, r: HitRadii, selected: (owner: number) => boolean): number | null {
  const near = hitTest(m, p, { radii: r, selected: [] });
  const sub = near.kind === "anchor" ? near.ref.sub : near.kind === "segment" ? near.sub : null;
  const owner = sub === null ? undefined : m.subs[sub]?.owner;
  if (owner !== undefined) return owner;
  for (let i = m.subs.length - 1; i >= 0; i--) {
    const o = m.subs[i].owner;
    if (o !== undefined && !selected(o) && inside(m.subs[i], p)) return o;
  }
  return null;
}
