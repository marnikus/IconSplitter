// hit.ts — what the pointer is over, in the path's own units (2026-11-06).
// Radii come in already converted from screen pixels, so targets stay the same
// size at any zoom. Order: a SELECTED anchor's handles, then anchors, then
// segments (a band around the centre line, not the drawn stroke). Shift-snap
// looks at the model as it was at drag start and never at the dragged anchor
// or its own two segments. Pure.

import { cubicAt, isLineSegment, nextIndex, prevIndex, segmentCubic, type AnchorRef, type PathModel, type Pt, type SubPath } from "./model";
import { paintedSubAt } from "./region";

export interface HitRadii { anchor: number; handle: number; segment: number }

export type Hit =
  | { kind: "handle"; ref: AnchorRef; side: "in" | "out" }
  | { kind: "anchor"; ref: AnchorRef }
  | { kind: "segment"; sub: number; i: number; t: number; pt: Pt }
  | { kind: "none" };

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

const inCtrlBox = (c: Pt[], p: Pt, r: number): boolean =>
  p.x >= Math.min(c[0].x, c[1].x, c[2].x, c[3].x) - r && p.x <= Math.max(c[0].x, c[1].x, c[2].x, c[3].x) + r
  && p.y >= Math.min(c[0].y, c[1].y, c[2].y, c[3].y) - r && p.y <= Math.max(c[0].y, c[1].y, c[2].y, c[3].y) + r;

/** The nearest point of segment i to `p`: projection on a line, sampling + refinement on a curve. */
export function nearestOnSegment(sub: SubPath, i: number, p: Pt, maxDist = Infinity): { t: number; pt: Pt; d: number } | null {
  const c = segmentCubic(sub, i);
  if (c === null || (Number.isFinite(maxDist) && !inCtrlBox(c, p, maxDist))) return null;
  if (isLineSegment(sub, i)) {
    const dx = c[3].x - c[0].x, dy = c[3].y - c[0].y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - c[0].x) * dx + (p.y - c[0].y) * dy) / len2));
    const pt = { x: c[0].x + dx * t, y: c[0].y + dy * t };
    return { t, pt, d: dist(pt, p) };
  }
  return refine(c, p);
}

function cubicDist2(c: Pt[], t: number, px: number, py: number): number {
  const u = 1 - t;
  const u2 = u * u, t2 = t * t;
  const b0 = u2 * u, b1 = 3 * u2 * t, b2 = 3 * u * t2, b3 = t2 * t;
  const dx = b0 * c[0].x + b1 * c[1].x + b2 * c[2].x + b3 * c[3].x - px;
  const dy = b0 * c[0].y + b1 * c[1].y + b2 * c[2].y + b3 * c[3].y - py;
  return dx * dx + dy * dy;
}

function refine(c: Pt[], p: Pt): { t: number; pt: Pt; d: number } {
  const N = 24;
  let best = 0;
  let bestD2 = cubicDist2(c, 0, p.x, p.y);
  for (let k = 1; k <= N; k++) {
    const d2 = cubicDist2(c, k / N, p.x, p.y);
    if (d2 < bestD2) { best = k; bestD2 = d2; }
  }
  let lo = Math.max(0, (best - 1) / N), hi = Math.min(1, (best + 1) / N);
  for (let k = 0; k < 18; k++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (cubicDist2(c, a, p.x, p.y) < cubicDist2(c, b, p.x, p.y)) hi = b; else lo = a;
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
  let bestD = r;
  m.subs.forEach((s, sub) => s.anchors.forEach((_, i) => {
    if (!can(sub)) return;
    const n = nearestOnSegment(s, i, p, bestD);
    if (n !== null && n.d <= r && (best === null || n.d < bestD)) { bestD = n.d; best = { kind: "segment", sub, i, t: n.t, pt: n.pt }; }
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
  let bestD = r;
  base.subs.forEach((s, sub) => s.anchors.forEach((_, i) => {
    if (nextIndex(s, i) === null || ownSegment(base, moving, sub, i)) return;
    const n = nearestOnSegment(s, i, p, bestD);
    if (n !== null && n.d <= r && (best === null || n.d < bestD)) { bestD = n.d; best = { kind: "segment", pt: n.pt, sub, i }; }
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

/**
 * The object (icon shape) a click picks, by geometry — a thin stroke is still
 * easy to pick (2026-11-06): within the anchor / segment band of any shape, else
 * where a shape PAINTS its fill. The empty inside of a shape without fill picks
 * nothing (2026-11-23): a stroke-only shape is picked on its line only
 * (strokepress.ts). Null on empty space.
 */
export function objectAt(m: PathModel, p: Pt, r: HitRadii): number | null {
  const near = hitTest(m, p, { radii: r, selected: [] });
  const sub = near.kind === "anchor" ? near.ref.sub : near.kind === "segment" ? near.sub : null;
  const owner = sub === null ? undefined : m.subs[sub]?.owner;
  if (owner !== undefined) return owner;
  const fill = paintedSubAt(m, p);
  return fill === null ? null : m.subs[fill]?.owner ?? null;
}
