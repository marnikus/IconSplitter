// pen.ts — the stroke expander's vocabulary (2026-10-09, design D4): the pen
// (width, cap, join, miter limit), a segment (line or cubic, absolute points),
// a subpath (segments + closed flag), and the small vector algebra every other
// expand file shares. Pure (RULE 3). Tangents of a degenerate cubic (a control
// point on its anchor) fall back to the next distinct point, as SVG does.

export type Pt = [number, number];

export type Cap = "butt" | "round" | "square";
export type Join = "miter" | "round" | "bevel";

export interface Pen {
  width: number;
  cap: Cap;
  join: Join;
  /** stroke-miterlimit (SVG default 4). */
  miter: number;
}

export type Seg =
  | { kind: "L"; a: Pt; b: Pt }
  | { kind: "C"; p0: Pt; p1: Pt; p2: Pt; p3: Pt };

export interface Subpath {
  segs: Seg[];
  closed: boolean;
  /** The first point — also the only point of a zero-length subpath. */
  start: Pt;
}

/** The expander's tolerance in px (design D4): offset error, arc-length splits. */
export const TOL = 0.01;
const EPS = 1e-9;

export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
/** z of a × b: > 0 turns one way, < 0 the other. */
export const cross = (a: Pt, b: Pt): number => a[0] * b[1] - a[1] * b[0];
export const length = (a: Pt): number => Math.hypot(a[0], a[1]);
export const same = (a: Pt, b: Pt): boolean => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

export function unit(a: Pt): Pt {
  const n = length(a);
  return n < EPS ? [0, 0] : [a[0] / n, a[1] / n];
}

/** The LEFT normal of a direction: for +x travel it points to −y (the design's "left" side). */
export const leftNormal = (t: Pt): Pt => [t[1], -t[0]];

export const segStart = (s: Seg): Pt => (s.kind === "L" ? s.a : s.p0);
export const segEnd = (s: Seg): Pt => (s.kind === "L" ? s.b : s.p3);

/** Unit tangent leaving the segment's start (a degenerate control falls through to the next point). */
export function startTangent(s: Seg): Pt {
  if (s.kind === "L") return unit(sub(s.b, s.a));
  for (const p of [s.p1, s.p2, s.p3]) if (!same(p, s.p0)) return unit(sub(p, s.p0));
  return [0, 0];
}

/** Unit tangent arriving at the segment's end. */
export function endTangent(s: Seg): Pt {
  if (s.kind === "L") return unit(sub(s.b, s.a));
  for (const p of [s.p2, s.p1, s.p0]) if (!same(p, s.p3)) return unit(sub(s.p3, p));
  return [0, 0];
}

/** The point at parameter t. */
export function pointAt(s: Seg, t: number): Pt {
  if (s.kind === "L") return add(s.a, mul(sub(s.b, s.a), t));
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [
    w[0] * s.p0[0] + w[1] * s.p1[0] + w[2] * s.p2[0] + w[3] * s.p3[0],
    w[0] * s.p0[1] + w[1] * s.p1[1] + w[2] * s.p2[1] + w[3] * s.p3[1],
  ];
}

/** The unit tangent at parameter t (the derivative, normalised; degenerate ends fall back to the end tangents). */
export function tangentAt(s: Seg, t: number): Pt {
  if (s.kind === "L") return unit(sub(s.b, s.a));
  const u = 1 - t;
  const d: Pt = [
    3 * u * u * (s.p1[0] - s.p0[0]) + 6 * u * t * (s.p2[0] - s.p1[0]) + 3 * t * t * (s.p3[0] - s.p2[0]),
    3 * u * u * (s.p1[1] - s.p0[1]) + 6 * u * t * (s.p2[1] - s.p1[1]) + 3 * t * t * (s.p3[1] - s.p2[1]),
  ];
  if (length(d) > EPS) return unit(d);
  return t < 0.5 ? startTangent(s) : endTangent(s);
}

/** The same segment travelled the other way. */
export function reverseSeg(s: Seg): Seg {
  return s.kind === "L" ? { kind: "L", a: s.b, b: s.a } : { kind: "C", p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 };
}

/** De Casteljau split of a segment at t → [first, second]. */
export function splitSeg(s: Seg, t: number): [Seg, Seg] {
  if (s.kind === "L") {
    const m = pointAt(s, t);
    return [{ kind: "L", a: s.a, b: m }, { kind: "L", a: m, b: s.b }];
  }
  const lerp = (a: Pt, b: Pt): Pt => add(a, mul(sub(b, a), t));
  const q0 = lerp(s.p0, s.p1); const q1 = lerp(s.p1, s.p2); const q2 = lerp(s.p2, s.p3);
  const r0 = lerp(q0, q1); const r1 = lerp(q1, q2);
  const m = lerp(r0, r1);
  return [{ kind: "C", p0: s.p0, p1: q0, p2: r0, p3: m }, { kind: "C", p0: m, p1: r1, p2: q2, p3: s.p3 }];
}

/** Is this a zero-length segment (every point on its start)? */
export function isDegenerate(s: Seg): boolean {
  if (s.kind === "L") return same(s.a, s.b);
  return same(s.p0, s.p1) && same(s.p0, s.p2) && same(s.p0, s.p3);
}
