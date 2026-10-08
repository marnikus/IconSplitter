// arclen.ts — the arc length of a segment and the split at a given length
// (2026-10-09, design D4 "Dashes"). A cubic's length comes from adaptive
// subdivision (de Casteljau) until the control polygon and the chord agree to
// TOL; a split at a length is the parameter found by bisection on that same
// measure, so a dash boundary inside a curve is a real point OF the curve.

import { length, splitSeg, sub, TOL, type Seg } from "./pen";

const MAX_DEPTH = 18;

/** The segment's arc length. */
export function segLength(s: Seg): number {
  if (s.kind === "L") return length(sub(s.b, s.a));
  return cubicLength(s, 0);
}

function cubicLength(s: Extract<Seg, { kind: "C" }>, depth: number): number {
  const chord = length(sub(s.p3, s.p0));
  const poly = length(sub(s.p1, s.p0)) + length(sub(s.p2, s.p1)) + length(sub(s.p3, s.p2));
  if (depth >= MAX_DEPTH || poly - chord <= TOL * 1e-3) return (chord + poly) / 2;
  const [a, b] = splitSeg(s, 0.5) as [Extract<Seg, { kind: "C" }>, Extract<Seg, { kind: "C" }>];
  return cubicLength(a, depth + 1) + cubicLength(b, depth + 1);
}

/** The segment cut where its arc length reaches `at` → [head, tail]; a line splits exactly, a cubic by bisection on t. */
export function splitAtLength(s: Seg, at: number): [Seg, Seg] {
  const total = segLength(s);
  if (s.kind === "L") return splitSeg(s, total === 0 ? 0 : Math.max(0, Math.min(1, at / total)));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (segLength(splitSeg(s, mid)[0]) < at) lo = mid; else hi = mid;
  }
  return splitSeg(s, (lo + hi) / 2);
}
