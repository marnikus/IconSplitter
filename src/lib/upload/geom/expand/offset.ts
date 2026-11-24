// offset.ts — one segment moved sideways by a distance (2026-10-09, design
// D4 step 3). A line offsets exactly. A cubic offsets by Tiller–Hanson (the
// control polygon's legs moved by d, re-intersected), checked at t = ¼ ½ ¾
// against the true offset P(t) + d·n(t); when the error exceeds TOL the cubic
// is split at t = ½ and both halves recurse (depth ≤ 8). Curves stay curves —
// no polyline faceting reaches the shipped file.

import {
  add, cross, isDegenerate, leftNormal, mul, same, splitSeg, sub, unit,
  type Pt, type Seg,
} from "./pen";

import { offsetFits } from "./offsetcheck";

const MAX_DEPTH = 8;

/** The segment offset to its left by `d` (negative d = right), as one or more segments. */
export function offsetSeg(s: Seg, d: number): Seg[] {
  if (isDegenerate(s)) return [];
  if (s.kind === "L") {
    const n = mul(leftNormal(unit(sub(s.b, s.a))), d);
    return [{ kind: "L", a: add(s.a, n), b: add(s.b, n) }];
  }
  const out: Seg[] = [];
  offsetCubicInto(s, d, 0, out);
  return out;
}

function offsetCubicInto(s: Extract<Seg, { kind: "C" }>, d: number, depth: number, out: Seg[]): void {
  const guess = tillerHanson(s, d);
  if (depth >= MAX_DEPTH || offsetFits(s, guess, d)) {
    out.push(guess);
    return;
  }
  const [a, b] = splitSeg(s, 0.5) as [Extract<Seg, { kind: "C" }>, Extract<Seg, { kind: "C" }>];
  offsetCubicInto(a, d, depth + 1, out);
  offsetCubicInto(b, d, depth + 1, out);
}

function shiftLeg(a: Pt, b: Pt, d: number): [Pt, Pt] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const ux = len < 1e-9 ? 0 : dx / len;
  const uy = len < 1e-9 ? 0 : dy / len;
  const nx = uy * d, ny = (-ux) * d;
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]];
}

/** The control polygon's three legs each moved by d; the new controls are where neighbouring legs meet. */
function tillerHanson(s: Extract<Seg, { kind: "C" }>, d: number): Extract<Seg, { kind: "C" }> {
  if (!same(s.p0, s.p1) && !same(s.p1, s.p2) && !same(s.p2, s.p3)) {
    const m0 = shiftLeg(s.p0, s.p1, d);
    const m1 = shiftLeg(s.p1, s.p2, d);
    const m2 = shiftLeg(s.p2, s.p3, d);
    return {
      kind: "C",
      p0: m0[0],
      p1: intersect(m0, m1) ?? m0[1],
      p2: intersect(m1, m2) ?? m2[0],
      p3: m2[1],
    };
  }
  const legs = distinctLegs(s);
  const moved = legs.map((leg) => shiftLeg(leg[0], leg[1], d));
  const p0 = moved[0][0];
  const p3 = moved[moved.length - 1][1];
  if (moved.length === 1) return { kind: "C", p0, p1: add(p0, mul(sub(p3, p0), 1 / 3)), p2: add(p0, mul(sub(p3, p0), 2 / 3)), p3 };
  const c = intersect(moved[0], moved[1]) ?? moved[0][1];
  return { kind: "C", p0, p1: c, p2: c, p3 };
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
