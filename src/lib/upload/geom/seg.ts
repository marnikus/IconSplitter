// seg.ts — the shared segment primitives (RULE 3): one straight segment
// with its end tangents, and the flat-point transform helper. Owned here so
// lib/upload/geom/path, lib/upload/geom/arc and lib/upload/geom/bounds never import each other in a
// circle.

import type { Matrix } from "./matrix";

/** One straight-or-curved segment with its end tangents (travel directions). */
export interface Seg {
  x1: number; y1: number; x2: number; y2: number;
  ax: number; ay: number; bx: number; by: number;
  /** Hull points: start, controls, end (flat x,y list). */
  hull: number[];
}

/** A straight segment between two points (shared with the shape builders). */
export function lineSeg(a: number[], b: number[]): Seg {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return { x1: a[0], y1: a[1], x2: b[0], y2: b[1], ax: dx, ay: dy, bx: dx, by: dy, hull: [a[0], a[1], b[0], b[1]] };
}

/** Transforms a flat point list (used by the EPS stage too). */
export function transformPoints(points: number[], m: Matrix): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    out.push(m.a * points[i] + m.c * points[i + 1] + m.e, m.b * points[i] + m.d * points[i + 1] + m.f);
  }
  return out;
}
