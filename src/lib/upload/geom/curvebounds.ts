// Tight bounds of represented cubic outlines, not their control polygons.
import type { Bounds } from "./bounds";
import type { Outline, OutlineOp } from "./ops";

interface Trace { x: number; y: number; startX: number; startY: number; bounds: Bounds | null }
export interface CurveBounds { bounds: Bounds | null; invalid: boolean }

/** Endpoints and derivative roots; callers affine-map controls before measuring. */
export function outlineBounds(outline: Outline): CurveBounds {
  const trace: Trace = { x: 0, y: 0, startX: 0, startY: 0, bounds: null };
  for (const op of outline.ops) {
    if (!Object.entries(op).every(([key, value]) => key === "op" || Number.isFinite(value))) return { bounds: null, invalid: true };
    traceOp(trace, op);
  }
  const invalid = trace.bounds !== null && !Object.values(trace.bounds).every(Number.isFinite);
  return { bounds: invalid ? null : trace.bounds, invalid };
}

function traceOp(trace: Trace, op: OutlineOp): void {
  if (op.op === "M") { trace.x = trace.startX = op.x; trace.y = trace.startY = op.y; return; }
  const end = op.op === "Z" ? { x: trace.startX, y: trace.startY } : op;
  addPoint(trace, trace.x, trace.y);
  addPoint(trace, end.x, end.y);
  if (op.op === "C") {
    const xs = [trace.x, op.x1, op.x2, op.x], ys = [trace.y, op.y1, op.y2, op.y];
    for (const t of [...extrema(xs), ...extrema(ys)]) addPoint(trace, evaluate(xs, t), evaluate(ys, t));
  }
  trace.x = end.x; trace.y = end.y;
}

function addPoint(trace: Trace, x: number, y: number): void {
  const b = trace.bounds;
  if (b === null) { trace.bounds = { minX: x, minY: y, width: 0, height: 0 }; return; }
  const minX = Math.min(b.minX, x), minY = Math.min(b.minY, y);
  trace.bounds = { minX, minY, width: Math.max(b.minX + b.width, x) - minX, height: Math.max(b.minY + b.height, y) - minY };
}

/** Scale before differencing; stable quadratic roots avoid subtractive cancellation. */
function extrema(points: number[]): number[] {
  const scale = Math.max(...points.map(Math.abs));
  if (scale === 0) return [];
  const [p0, p1, p2, p3] = points.map((p) => p / scale);
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
  return derivativeRoots(a, b, c).filter((t) => t > 0 && t < 1);
}

function derivativeRoots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  if (d === 0) return [-b / (2 * a)];
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(d));
  return [q / a, c / q];
}

/** de Casteljau, avoiding the large power-basis coefficients when evaluating. */
function evaluate(points: number[], t: number): number {
  const row = [...points];
  for (let n = 3; n > 0; n--) for (let i = 0; i < n; i++) row[i] = (1 - t) * row[i] + t * row[i + 1];
  return row[0];
}
