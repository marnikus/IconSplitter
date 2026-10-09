// joins.ts — what connects two offset segments at a vertex, and what closes
// an open end (2026-10-09, design D4 steps 4–5). The OUTER side of a corner
// gets the pen's join: miter (within stroke-miterlimit, else bevel), round
// (an arc of ≤ 90° cubics, the same KAPPA family as shapes.ts) or bevel. The
// INNER side pivots through the original vertex (offset end → vertex → next
// offset start), which keeps every loop's winding consistent for the nonzero
// rule. Caps: butt across, square extended by w/2, round = a semicircle.

import { cv, ln, type OutlineOp } from "../ops";
import { add, cross, dot, length, mul, same, sub, type Pen, type Pt } from "./pen";

/** One corner: the vertex, the arriving and leaving unit tangents, the end of the previous offset and the start of the next. */
export interface Corner {
  v: Pt;
  tIn: Pt;
  tOut: Pt;
  from: Pt;
  to: Pt;
}

const MITER_EPS = 1e-9;

/** The ops from `from` to `to` around the corner, for the side offset by `d` (> 0 = left). */
export function joinOps(pen: Pen, d: number, c: Corner): OutlineOp[] {
  if (same(c.from, c.to)) return [];
  const turn = cross(c.tIn, c.tOut);
  if (Math.abs(turn) < MITER_EPS && dot(c.tIn, c.tOut) > 0) return [ln(c.to[0], c.to[1])]; // collinear: a seam
  const outer = turn * d > 0;
  if (!outer) return [ln(c.v[0], c.v[1]), ln(c.to[0], c.to[1])]; // the pivot
  if (pen.join === "round") return arcOps(c.v, c.from, c.to, shortSweep(c));
  if (pen.join === "miter") {
    const tip = miterTip(pen, c);
    if (tip !== null) return [ln(tip[0], tip[1]), ln(c.to[0], c.to[1])];
  }
  return [ln(c.to[0], c.to[1])];
}

/** The miter point when the ratio 1/sin(θ/2) is within the limit; null → bevel. */
function miterTip(pen: Pen, c: Corner): Pt | null {
  const cosTheta = -dot(c.tIn, c.tOut); // θ = the interior angle between the segments
  const sinHalf = Math.sqrt(Math.max(0, (1 - cosTheta) / 2));
  if (sinHalf < MITER_EPS || 1 / sinHalf > pen.miter) return null;
  const den = cross(c.tIn, c.tOut);
  const t = cross(sub(c.to, c.from), c.tOut) / den;
  return add(c.from, mul(c.tIn, t));
}

/** The signed sweep (radians) from `from` to `to` around `v`, the short way. */
function shortSweep(c: Corner): number {
  const a0 = Math.atan2(c.from[1] - c.v[1], c.from[0] - c.v[0]);
  const a1 = Math.atan2(c.to[1] - c.v[1], c.to[0] - c.v[0]);
  return normalizeAngle(a1 - a0);
}

function normalizeAngle(a: number): number {
  let r = a;
  while (r <= -Math.PI) r += 2 * Math.PI;
  while (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

/** An arc around `center` from `from` to `to` sweeping `sweep` radians, as ≤ 90° cubics (k = 4/3·tan(Δ/4)). */
export function arcOps(center: Pt, from: Pt, to: Pt, sweep: number): OutlineOp[] {
  const r = length(sub(from, center));
  const pieces = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const step = sweep / pieces;
  const k = (4 / 3) * Math.tan(Math.abs(step) / 4) * r;
  const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]);
  const ops: OutlineOp[] = [];
  for (let i = 0; i < pieces; i += 1) {
    const s = a0 + i * step;
    const e = s + step;
    const p0 = i === 0 ? from : [center[0] + r * Math.cos(s), center[1] + r * Math.sin(s)];
    const p3 = i === pieces - 1 ? to : [center[0] + r * Math.cos(e), center[1] + r * Math.sin(e)];
    const sign = Math.sign(step);
    const c1 = [p0[0] - sign * k * Math.sin(s), p0[1] + sign * k * Math.cos(s)];
    const c2 = [p3[0] + sign * k * Math.sin(e), p3[1] - sign * k * Math.cos(e)];
    ops.push(cv(c1, c2, p3));
  }
  return ops;
}

/** One end of an open subpath: the vertex, the unit tangent LEAVING the stroke there, and the two offset points to bridge. */
export interface EndSite {
  p: Pt;
  t: Pt;
  from: Pt;
  to: Pt;
}

/** The cap from `from` to `to` around the end point, bulging along `t`. */
export function capOps(pen: Pen, d: number, e: EndSite): OutlineOp[] {
  if (pen.cap === "round") return arcOps(e.p, e.from, e.to, capSweep(e));
  if (pen.cap === "square") {
    const ext = mul(e.t, Math.abs(d));
    const a = add(e.from, ext);
    const b = add(e.to, ext);
    return [ln(a[0], a[1]), ln(b[0], b[1]), ln(e.to[0], e.to[1])];
  }
  return [ln(e.to[0], e.to[1])];
}

/** A half turn whose middle lies along the leaving tangent. */
function capSweep(e: EndSite): number {
  const a0 = Math.atan2(e.from[1] - e.p[1], e.from[0] - e.p[0]);
  const mid = Math.atan2(e.t[1], e.t[0]);
  return normalizeAngle(mid - a0) > 0 ? Math.PI : -Math.PI;
}

/** A zero-length subpath: round → a dot of radius d, square → a square of side 2d, butt → nothing (SVG). */
export function dotOps(pen: Pen, d: number, p: Pt): OutlineOp[] {
  const r = Math.abs(d);
  if (pen.cap === "round") {
    const from: Pt = [p[0] + r, p[1]];
    return [ln(from[0], from[1]), ...arcOps(p, from, [p[0] - r, p[1]], Math.PI), ...arcOps(p, [p[0] - r, p[1]], from, Math.PI)];
  }
  if (pen.cap === "square") return [ln(p[0] - r, p[1] - r), ln(p[0] + r, p[1] - r), ln(p[0] + r, p[1] + r), ln(p[0] - r, p[1] + r)];
  return [];
}
