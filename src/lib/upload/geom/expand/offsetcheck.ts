// Conservative tolerance decisions for the existing forty-step golden search.
// Same Bernstein arithmetic/order, without allocating point/weight vectors.
// A cubic's speed <= 3*max(control-edge lengths): only certify an interval when
// ALL its points are on the same side of tolerance, with rounding slack. Near
// the boundary/nonfinite inputs always fall back to the original full search.
import { pointAt, tangentAt, TOL, type Pt, type Seg } from "./pen";

type Cubic = Extract<Seg, { kind: "C" }>;
const SAMPLE_TS = [0.25, 0.5, 0.75] as const;

export function offsetFits(s: Cubic, guess: Cubic, distance: number): boolean {
  const tolSq = TOL * TOL;
  for (let k = 0; k < 3; k += 1) {
    const t = SAMPLE_TS[k];
    const p = pointAt(s, t);
    const tan = tangentAt(s, t);
    const want: Pt = [p[0] + tan[1] * distance, p[1] + (-tan[0]) * distance];
    if (squaredDistance(guess, want, t) <= tolSq) continue;
    const verdict = newtonDecide(guess, want, t);
    if (verdict === true) continue;
    if (verdict === false || !cubicDistanceWithin(guess, want, TOL)) return false;
  }
  return true;
}

/** Certifies false via Bezier derivative convex-hull speed bound + 2nd-derivative remainder when strictly > TOL. */
function certifyStrictMiss(s: Cubic, r: Pt, dt: Pt): boolean {
  const vLen = Math.sqrt(dt[0] * dt[0] + dt[1] * dt[1]);
  if (vLen <= 1e-6) return false;
  const ex = dt[0] / vLen, ey = dt[1] / vLen;
  const v0x = 3 * (s.p1[0] - s.p0[0]), v0y = 3 * (s.p1[1] - s.p0[1]);
  const v1x = 3 * (s.p2[0] - s.p1[0]), v1y = 3 * (s.p2[1] - s.p1[1]);
  const v2x = 3 * (s.p3[0] - s.p2[0]), v2y = 3 * (s.p3[1] - s.p2[1]);
  const sMin = Math.min(v0x * ex + v0y * ey, v1x * ex + v1y * ey, v2x * ex + v2y * ey);
  if (sMin <= 1e-6) return false;
  const dMax = (TOL + Math.abs(r[0] * ex + r[1] * ey)) / sMin;
  const a0 = Math.sqrt((v1x - v0x) * (v1x - v0x) + (v1y - v0y) * (v1y - v0y));
  const a1 = Math.sqrt((v2x - v1x) * (v2x - v1x) + (v2y - v1y) * (v2y - v1y));
  const m2 = 2 * Math.max(a0, a1);
  const normalDist = Math.abs(-r[0] * ey + r[1] * ex);
  return normalDist - 0.5 * m2 * dMax * dMax > TOL + 1e-7;
}

/** Two Gauss-Newton refinements from startT: certifies true or false in O(1) when unambiguous. */
function newtonDecide(s: Cubic, p: Pt, startT: number): boolean | undefined {
  const tolSq = TOL * TOL;
  let u = startT;
  for (let iter = 0; iter < 2; iter += 1) {
    const m = 1 - u, mm = m * m, uu = u * u;
    const gx = mm * m * s.p0[0] + 3 * mm * u * s.p1[0] + 3 * m * uu * s.p2[0] + uu * u * s.p3[0] - p[0];
    const gy = mm * m * s.p0[1] + 3 * mm * u * s.p1[1] + 3 * m * uu * s.p2[1] + uu * u * s.p3[1] - p[1];
    const dtx = 3 * mm * (s.p1[0] - s.p0[0]) + 6 * m * u * (s.p2[0] - s.p1[0]) + 3 * uu * (s.p3[0] - s.p2[0]);
    const dty = 3 * mm * (s.p1[1] - s.p0[1]) + 6 * m * u * (s.p2[1] - s.p1[1]) + 3 * uu * (s.p3[1] - s.p2[1]);
    const denom = dtx * dtx + dty * dty;
    if (denom <= 1e-18) return undefined;
    u = Math.min(1, Math.max(0, u - (gx * dtx + gy * dty) / denom));
    if (squaredDistance(s, p, u) <= tolSq) return true;
  }
  const m = 1 - u, mm = m * m, uu = u * u;
  const rx = mm * m * s.p0[0] + 3 * mm * u * s.p1[0] + 3 * m * uu * s.p2[0] + uu * u * s.p3[0] - p[0];
  const ry = mm * m * s.p0[1] + 3 * mm * u * s.p1[1] + 3 * m * uu * s.p2[1] + uu * u * s.p3[1] - p[1];
  const dtx = 3 * mm * (s.p1[0] - s.p0[0]) + 6 * m * u * (s.p2[0] - s.p1[0]) + 3 * uu * (s.p3[0] - s.p2[0]);
  const dty = 3 * mm * (s.p1[1] - s.p0[1]) + 6 * m * u * (s.p2[1] - s.p1[1]) + 3 * uu * (s.p3[1] - s.p2[1]);
  return certifyStrictMiss(s, [rx, ry], [dtx, dty]) ? false : undefined;
}

function squaredDistance(s: Cubic, p: Pt, t: number): number {
  const u = 1 - t, uu = u * u, tt = t * t;
  const w0 = uu * u, w1 = 3 * uu * t, w2 = 3 * u * tt, w3 = tt * t;
  const dx = w0 * s.p0[0] + w1 * s.p1[0] + w2 * s.p2[0] + w3 * s.p3[0] - p[0];
  const dy = w0 * s.p0[1] + w1 * s.p1[1] + w2 * s.p2[1] + w3 * s.p3[1] - p[1];
  return dx * dx + dy * dy;
}

function edgeLen(a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function speedBound(s: Cubic): number {
  return 3 * Math.max(edgeLen(s.p0, s.p1), edgeLen(s.p1, s.p2), edgeLen(s.p2, s.p3));
}

function certify(distance: number, radius: number, tolerance: number): boolean | undefined {
  if (!Number.isFinite(distance)) return undefined;
  if (distance + radius <= tolerance) return true;
  if (distance - radius > tolerance) return false;
  return undefined;
}

export function cubicDistanceWithin(s: Cubic, p: Pt, tolerance: number): boolean {
  const reach = speedBound(s);
  // The largest coordinate magnitude (floored at 1): the rounding slack's scale. No arrays, no spreads — this runs
  // for every sampled point of every offset segment (2026-11-08, export speed); the value is the same.
  const scale = Math.max(
    1, Math.abs(s.p0[0]), Math.abs(s.p0[1]), Math.abs(s.p1[0]), Math.abs(s.p1[1]), Math.abs(s.p2[0]), Math.abs(s.p2[1]),
    Math.abs(s.p3[0]), Math.abs(s.p3[1]), Math.abs(p[0]), Math.abs(p[1]),
  );
  const slack = 64 * Number.EPSILON * scale;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    if (i >= 8 && i % 4 === 0) {
      const decision = certify(Math.sqrt(squaredDistance(s, p, (lo + hi) / 2)), reach * (hi - lo) / 2 + slack, tolerance);
      if (decision !== undefined) return decision;
    }
    const m1 = lo + (hi - lo) * 0.382;
    const m2 = lo + (hi - lo) * 0.618;
    if (squaredDistance(s, p, m1) < squaredDistance(s, p, m2)) hi = m2; else lo = m1;
  }
  return Math.sqrt(squaredDistance(s, p, (lo + hi) / 2)) <= tolerance;
}
