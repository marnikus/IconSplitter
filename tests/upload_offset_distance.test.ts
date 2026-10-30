// @vitest-environment node
import { expect, it } from 'vitest';
import { cubicDistanceWithin } from '../src/lib/upload/geom/expand/offsetcheck';
import { pointAt, type Pt, type Seg } from '../src/lib/upload/geom/expand/pen';
import { offsetCases } from './helpers/offsetcases';

type Cubic = Extract<Seg, {kind: 'C'}>;
function originalDistance(s: Cubic, p: Pt): number {
  const f = (t: number) => { const q = pointAt(s, t); const dx = q[0] - p[0], dy = q[1] - p[1]; return dx * dx + dy * dy; };
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
    if (f(m1) < f(m2)) hi = m2; else lo = m1;
  }
  return Math.sqrt(f((lo + hi) / 2));
}

it('matches the original40-step result on and around the floating-point threshold', () => {
  for (const {curve} of offsetCases()) {
    const s = curve as Cubic;
    for (const p of [[0, 0], [100, -50], pointAt(s, 0.37)] as Pt[]) {
      const distance = originalDistance(s, p);
      for (const tolerance of [0, 0.01, 1000, distance, distance * (1 - 1e-13), distance * (1 + 1e-13)]) {
        expect(cubicDistanceWithin(s, p, tolerance), JSON.stringify({s, p, tolerance})).toBe(distance <= tolerance);
      }
    }
  }
});

it('preserves nonfinite/degenerate behavior instead of certifying an uncertain interval', () => {
  const s = offsetCases()[0].curve as Cubic;
  const degenerate: Cubic = {kind: 'C', p0: [2, 3], p1: [2, 3], p2: [2, 3], p3: [2, 3]};
  for (const [curve, p, tolerance] of [
    [s, [NaN, 0], 0.01], [s, [Infinity, 0], 0.01], [s, [Infinity, 0], Infinity],
    [{...s, p1: [NaN, 0]}, [0, 0], 0.01], [degenerate, [2, 3], 0],
    [s, [0, 0], -1], [s, [0, 0], NaN],
  ] as [Cubic, Pt, number][]) {
    expect(cubicDistanceWithin(curve, p, tolerance)).toBe(originalDistance(curve, p) <= tolerance);
  }
});
