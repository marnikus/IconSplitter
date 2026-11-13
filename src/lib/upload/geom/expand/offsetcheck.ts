// Conservative tolerance decisions for the existing forty-step golden search.
// Same Bernstein arithmetic/order, without allocating point/weight vectors.
// A cubic's speed <= 3*max(control-edge lengths): only certify an interval when
// ALL its points are on the same side of tolerance, with rounding slack. Near
// the boundary/nonfinite inputs always fall back to the original full search.
import { add, leftNormal, mul, pointAt, tangentAt, TOL, type Pt, type Seg } from "./pen";

type Cubic = Extract<Seg, { kind: "C" }>;

export function offsetFits(s: Cubic, guess: Cubic, distance: number): boolean {
  for (const t of [0.25, 0.5, 0.75]) {
    const want = add(pointAt(s, t), mul(leftNormal(tangentAt(s, t)), distance));
    if (!cubicDistanceWithin(guess, want, TOL)) return false;
  }
  return true;
}

function squaredDistance(s: Cubic, p: Pt, t: number): number {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  const dx = w0 * s.p0[0] + w1 * s.p1[0] + w2 * s.p2[0] + w3 * s.p3[0] - p[0];
  const dy = w0 * s.p0[1] + w1 * s.p1[1] + w2 * s.p2[1] + w3 * s.p3[1] - p[1];
  return dx * dx + dy * dy;
}

function speedBound(s: Cubic): number {
  return 3 * Math.max(
    Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]),
    Math.hypot(s.p2[0] - s.p1[0], s.p2[1] - s.p1[1]),
    Math.hypot(s.p3[0] - s.p2[0], s.p3[1] - s.p2[1]),
  );
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
