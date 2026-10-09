// offset.ts — one segment moved sideways by a distance (2026-10-09, design
// D4 step 3). A line offsets exactly. A cubic offsets by Tiller–Hanson (the
// control polygon's legs moved by d, re-intersected), checked at t = ¼ ½ ¾
// against the true offset P(t) + d·n(t); when the error exceeds TOL the cubic
// is split at t = ½ and both halves recurse (depth ≤ 8). Curves stay curves —
// no polyline faceting reaches the shipped file.

import {
  add, cross, dot, isDegenerate, leftNormal, mul, pointAt, same, splitSeg, sub, tangentAt, unit, TOL,
  type Pt, type Seg,
} from "./pen";

const MAX_DEPTH = 8;
const CHECKS = [0.25, 0.5, 0.75];

/** The segment offset to its left by `d` (negative d = right), as one or more segments. */
export function offsetSeg(s: Seg, d: number): Seg[] {
  if (isDegenerate(s)) return [];
  if (s.kind === "L") {
    const n = mul(leftNormal(unit(sub(s.b, s.a))), d);
    return [{ kind: "L", a: add(s.a, n), b: add(s.b, n) }];
  }
  return offsetCubic(s, d, 0);
}

function offsetCubic(s: Extract<Seg, { kind: "C" }>, d: number, depth: number): Seg[] {
  const guess = tillerHanson(s, d);
  if (depth >= MAX_DEPTH || maxError(s, guess, d) <= TOL) return [guess];
  const [a, b] = splitSeg(s, 0.5) as [Extract<Seg, { kind: "C" }>, Extract<Seg, { kind: "C" }>];
  return [...offsetCubic(a, d, depth + 1), ...offsetCubic(b, d, depth + 1)];
}

/** The control polygon's three legs each moved by d; the new controls are where neighbouring legs meet. */
function tillerHanson(s: Extract<Seg, { kind: "C" }>, d: number): Seg {
  const legs = distinctLegs(s);
  const moved = legs.map((leg) => {
    const n = mul(leftNormal(unit(sub(leg[1], leg[0]))), d);
    return [add(leg[0], n), add(leg[1], n)] as [Pt, Pt];
  });
  const p0 = moved[0][0];
  const p3 = moved[moved.length - 1][1];
  if (moved.length === 1) return { kind: "C", p0, p1: add(p0, mul(sub(p3, p0), 1 / 3)), p2: add(p0, mul(sub(p3, p0), 2 / 3)), p3 };
  if (moved.length === 2) {
    const c = intersect(moved[0], moved[1]) ?? moved[0][1];
    return { kind: "C", p0, p1: c, p2: c, p3 };
  }
  const p1 = intersect(moved[0], moved[1]) ?? moved[0][1];
  const p2 = intersect(moved[1], moved[2]) ?? moved[2][0];
  return { kind: "C", p0, p1, p2, p3 };
}

/** The polygon legs with zero-length legs dropped (a control on its anchor). */
function distinctLegs(s: Extract<Seg, { kind: "C" }>): [Pt, Pt][] {
  const pts = [s.p0, s.p1, s.p2, s.p3].filter((p, i, all) => i === 0 || !same(p, all[i - 1]));
  const legs: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < pts.length; i += 1) legs.push([pts[i], pts[i + 1]]);
  return legs;
}

/** Where two infinite lines meet; null when parallel. */
function intersect(a: [Pt, Pt], b: [Pt, Pt]): Pt | null {
  const r = sub(a[1], a[0]);
  const s = sub(b[1], b[0]);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(b[0], a[0]), s) / den;
  return add(a[0], mul(r, t));
}

/** The largest distance between the guess and the true offset at the check parameters. */
function maxError(s: Seg, guess: Seg, d: number): number {
  let worst = 0;
  for (const t of CHECKS) {
    const want = add(pointAt(s, t), mul(leftNormal(tangentAt(s, t)), d));
    worst = Math.max(worst, nearestDistance(guess, want));
  }
  return worst;
}

/** Distance from a point to a segment, by a short golden-section search on t. */
function nearestDistance(s: Seg, p: Pt): number {
  let lo = 0;
  let hi = 1;
  const f = (t: number) => { const q = sub(pointAt(s, t), p); return dot(q, q); };
  for (let i = 0; i < 40; i += 1) {
    const m1 = lo + (hi - lo) * 0.382;
    const m2 = lo + (hi - lo) * 0.618;
    if (f(m1) < f(m2)) hi = m2; else lo = m1;
  }
  return Math.sqrt(f((lo + hi) / 2));
}
