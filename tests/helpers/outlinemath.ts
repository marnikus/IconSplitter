// outlinemath.ts — numeric checks over an Outline for the stroke-expansion
// tests (2026-10-09): flatten to polygons, the nonzero winding at a point,
// the shoelace area, and the distance from a point to a polyline centreline.
// The tests measure what a stock reviewer would see — coverage, area, offset
// distance — never anchor counts (design D4).
import type { Outline, OutlineOp } from "../../src/lib/upload/geom/outline";

export type Pt = [number, number];

/** A cubic sampled into `n` chords. */
function cubic(p0: Pt, op: Extract<OutlineOp, { op: "C" }>, n = 32): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * op.x1 + 3 * u * t * t * op.x2 + t * t * t * op.x,
      u * u * u * p0[1] + 3 * u * u * t * op.y1 + 3 * u * t * t * op.y2 + t * t * t * op.y,
    ]);
  }
  return out;
}

/** The outline as closed polygons (one per subpath), cubics flattened into `n` chords each. */
export function polygons(o: Outline, n = 32): Pt[][] {
  const polys: Pt[][] = [];
  let cur: Pt[] = [];
  for (const op of o.ops) {
    if (op.op === "M") { if (cur.length > 1) polys.push(cur); cur = [[op.x, op.y]]; }
    else if (op.op === "L") cur.push([op.x, op.y]);
    else if (op.op === "C") cur.push(...cubic(cur[cur.length - 1], op, n));
    else { if (cur.length > 1) polys.push(cur); cur = cur.length > 0 ? [cur[0]] : []; }
  }
  if (cur.length > 1) polys.push(cur);
  return polys;
}

/** The nonzero winding number of `p` over every subpath together. */
export function winding(o: Outline, p: Pt): number {
  let w = 0;
  for (const poly of polygons(o)) {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a[1] <= p[1]) {
        if (b[1] > p[1] && cross(a, b, p) > 0) w += 1;
      } else if (b[1] <= p[1] && cross(a, b, p) < 0) w -= 1;
    }
  }
  return w;
}

function cross(a: Pt, b: Pt, p: Pt): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]);
}

/** The signed shoelace area summed over the subpaths (nonzero-consistent loops add up). */
export function area(o: Outline): number {
  let sum = 0;
  for (const poly of polygons(o)) {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      sum += a[0] * b[1] - b[0] * a[1];
    }
  }
  return sum / 2;
}

/** The area the nonzero rule actually fills: sampled on a grid over the bounds. */
export function filledArea(o: Outline, step = 0.05): number {
  const pts = polygons(o).flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let count = 0;
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let y = y0 + step / 2; y < y1; y += step) if (winding(o, [x, y]) !== 0) count += 1;
  }
  return count * step * step;
}

/** Distance from `p` to the closest point of a polyline (flattened centreline). */
export function distanceToPolyline(p: Pt, line: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const [a, b] = [line[i], line[i + 1]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return best;
}

/** The centreline of an outline as one flattened polyline (first subpath; a closed one returns to its start). */
export function centreline(o: Outline): Pt[] {
  const line = polygons(o)[0] ?? [];
  return o.ops.some((op) => op.op === "Z") && line.length > 0 ? [...line, line[0]] : line;
}
