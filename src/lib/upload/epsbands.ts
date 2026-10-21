// epsbands.ts — compact, optimized Level-2 PostScript vector gradient preview
// (`<= 16` pure 4-anchor cubic-Bezier ellipses for radial, `<= 20` convex slabs
// for linear; `0` 48-gon tessellation, `0` `shfill`, `0` raster operators).

import { fmt } from "./geom";
import type { Bounds } from "./geom/bounds";
import { multiply, type Matrix } from "./geom/matrix";
import { psColor, type Rgb } from "./epsgradient";
import type { FlatStop } from "./epsshading";

type Pt = [number, number];
const KAPPA = 0.5522847498;
const MAX_RADIAL_BANDS = 16;
const MAX_LINEAR_SLABS = 20;

export interface LinearBandInput {
  mat: Matrix;
  stops: FlatStop[];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RadialBandInput {
  mat: Matrix;
  stops: FlatStop[];
  fx: number;
  fy: number;
  fr: number;
  cx: number;
  cy: number;
  r: number;
}

export function linearBandsPs(spec: LinearBandInput, box: Bounds): string {
  const dx = spec.x2 - spec.x1;
  const dy = spec.y2 - spec.y1;
  const full = multiply(spec.mat, { a: dx, b: dy, c: -dy, d: dx, e: spec.x1, f: spec.y1 });
  const det = full.a * full.d - full.b * full.c;
  if (Math.abs(det) < 1e-12) return polyFillPs(rectCorners(box), spec.stops[spec.stops.length - 1].color);
  const invA = full.d / det;
  const invC = -full.c / det;
  const invE = (full.c * full.f - full.d * full.e) / det;
  return emitLinearSlabs(spec.stops, box, (x, y) => invA * x + invC * y + invE);
}

export function radialBandsPs(spec: RadialBandInput, box: Bounds): string {
  const n = stepCount(spec.stops, MAX_RADIAL_BANDS);
  const outer = spec.stops[spec.stops.length - 1].color;
  const out = [polyFillPs(rectCorners(box), outer)];
  let prev = outer;
  for (let k = n - 1; k >= 0; k--) {
    const color = sampleStops(spec.stops, k / Math.max(1, n - 1));
    if (k > 0 && colorDelta(color, prev) < 1 / 255) continue;
    const s = (k + 1) / n;
    const r = spec.fr + s * (spec.r - spec.fr);
    if (r <= 1e-9) continue;
    prev = color;
    const cx = spec.fx + s * (spec.cx - spec.fx);
    const cy = spec.fy + s * (spec.cy - spec.fy);
    out.push(bezierCirclePs(circleBezierPoints(cx, cy, r).map(([x, y]) => mapMat(spec.mat, x, y)), color));
  }
  return out.join("\r\n");
}

function emitLinearSlabs(stops: FlatStop[], box: Bounds, field: (x: number, y: number) => number): string {
  const corners = rectCorners(box);
  const ts = corners.map(([x, y]) => field(x, y));
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const n = stepCount(stops, MAX_LINEAR_SLABS);
  const out: string[] = [];
  if (tMin < 0) out.push(slabPs(corners, field, [tMin - 1, 1e-4], stops[0].color));
  for (let k = 0; k < n; k++) {
    const lo = k / n;
    const hi = (k + 1) / n + (k + 1 < n ? 0.5 / n : 0);
    if (hi < tMin || lo > tMax) continue;
    out.push(slabPs(corners, field, [lo, hi], sampleStops(stops, (k + 0.5) / n)));
  }
  if (tMax > 1) out.push(slabPs(corners, field, [1 - 1e-4, tMax + 1], stops[stops.length - 1].color));
  return out.filter((s) => s !== "").join("\r\n");
}

function slabPs(corners: Pt[], field: (x: number, y: number) => number, [lo, hi]: [number, number], color: Rgb): string {
  const low = clipHalf(corners, (x, y) => field(x, y) - lo);
  const poly = clipHalf(low, (x, y) => hi - field(x, y));
  return poly.length < 3 ? "" : polyFillPs(poly, color);
}

function circleBezierPoints(cx: number, cy: number, r: number): Pt[] {
  const k = r * KAPPA;
  return [
    [cx + r, cy],
    [cx + r, cy + k], [cx + k, cy + r], [cx, cy + r],
    [cx - k, cy + r], [cx - r, cy + k], [cx - r, cy],
    [cx - r, cy - k], [cx - k, cy - r], [cx, cy - r],
    [cx + k, cy - r], [cx + r, cy - k], [cx + r, cy],
  ];
}

function bezierCirclePs(pts: Pt[], color: Rgb): string {
  const segs = [`${psColor(color)} setrgbcolor ${fmt(pts[0][0])} ${fmt(pts[0][1])} moveto`];
  for (let i = 1; i < pts.length; i += 3) {
    segs.push(`${fmt(pts[i][0])} ${fmt(pts[i][1])} ${fmt(pts[i + 1][0])} ${fmt(pts[i + 1][1])} ${fmt(pts[i + 2][0])} ${fmt(pts[i + 2][1])} curveto`);
  }
  segs[segs.length - 1] += " closepath fill";
  return segs.join("\r\n");
}

function clipHalf(poly: Pt[], evalSide: (x: number, y: number) => number): Pt[] {
  if (poly.length === 0) return [];
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = evalSide(a[0], a[1]);
    const fb = evalSide(b[0], b[1]);
    if (fa >= -1e-9) out.push(a);
    if ((fa >= -1e-9) !== (fb >= -1e-9)) {
      const t = fa / (fa - fb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

function polyFillPs(poly: Pt[], color: Rgb): string {
  const lines = [`${psColor(color)} setrgbcolor ${fmt(poly[0][0])} ${fmt(poly[0][1])} moveto`];
  for (const [x, y] of poly.slice(1)) {
    const seg = `${fmt(x)} ${fmt(y)} lineto`;
    const cur = lines[lines.length - 1];
    if (cur.length + 1 + seg.length > 180) lines.push(seg);
    else lines[lines.length - 1] = `${cur} ${seg}`;
  }
  lines[lines.length - 1] += " closepath fill";
  return lines.join("\r\n");
}

function rectCorners(b: Bounds): Pt[] {
  const maxX = b.minX + b.width;
  const maxY = b.minY + b.height;
  return [[b.minX, b.minY], [maxX, b.minY], [maxX, maxY], [b.minX, maxY]];
}

function mapMat(m: Matrix, x: number, y: number): Pt {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

function colorDelta(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(b.r - a.r), Math.abs(b.g - a.g), Math.abs(b.b - a.b));
}

function stepCount(stops: FlatStop[], cap: number): number {
  let span = 0;
  for (let i = 1; i < stops.length; i++) span += colorDelta(stops[i - 1].color, stops[i].color);
  return Math.min(cap, Math.max(8, Math.ceil(span * 32)));
}

function sampleStops(stops: FlatStop[], t: number): Rgb {
  if (t <= stops[0].offset) return stops[0].color;
  const last = stops[stops.length - 1];
  if (t >= last.offset) return last.color;
  let i = 1;
  while (i < stops.length - 1 && stops[i].offset < t) i++;
  const a = stops[i - 1];
  const b = stops[i];
  const u = (t - a.offset) / Math.max(1e-9, b.offset - a.offset);
  return { r: a.color.r + u * (b.color.r - a.color.r), g: a.color.g + u * (b.color.g - a.color.g), b: a.color.b + u * (b.color.b - a.color.b) };
}
