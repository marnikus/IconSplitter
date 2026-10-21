// epsshading.ts — pure vector gradient geometry, pure-TS gradient stroke
// outline expansion, and PostScript LanguageLevel 3 smooth shadings (`shfill`).

import { fmt } from "./geom";
import { localShapeBounds, type Bounds } from "./geom/bounds";
import { expandOutline } from "./geom/expand/assemble";
import type { DashSpec } from "./geom/expand/dash";
import type { Cap, Join, Pen } from "./geom/expand/pen";
import { identity, multiply, type Matrix } from "./geom/matrix";
import type { Outline } from "./geom/outline";
import { mix, psColor, Unsupported, type EpsGradient, type GradStop, type Rgb } from "./epsgradient";

export interface ShadingCtx {
  el: Element;
  viewBox: number[];
  bg: Rgb;
  alpha: number;
  evenOdd?: boolean;
}

export interface FlatStop {
  offset: number;
  color: Rgb;
}

export type ResolvedGradient =
  | { kind: "none" }
  | { kind: "solid"; color: Rgb }
  | { kind: "linear"; mat: Matrix; stops: FlatStop[]; x1: number; y1: number; x2: number; y2: number }
  | { kind: "radial"; mat: Matrix; stops: FlatStop[]; fx: number; fy: number; fr: number; cx: number; cy: number; r: number };

export interface StrokeExpandSpec {
  width: number;
  cap: number;
  join: number;
  miter: number;
  dash: number[] | null;
  dashOffset: number;
}

const CAPS: Cap[] = ["butt", "round", "square"];
const JOINS: Join[] = ["miter", "round", "bevel"];

/** Resolve a gradient on `ctx.el` into opaque stops + exact local coordinates. */
export function resolveGradientSpec(grad: EpsGradient, ctx: ShadingCtx): ResolvedGradient {
  if (grad.stops.length === 0) return { kind: "none" };
  if (grad.stops.length === 1) {
    const s = grad.stops[0];
    return { kind: "solid", color: mix(s.color, ctx.bg, s.opacity * ctx.alpha) };
  }
  const mat = gradientMatrix(grad, ctx.el);
  const stops = normalizeStops(grad.stops, ctx.bg, ctx.alpha);
  return grad.kind === "radial" ? resolveRadial(grad, ctx, mat, stops) : resolveLinear(grad, ctx, mat, stops);
}

/** Emit PostScript Level 3 smooth shading for the current path, or `""` for 0 stops. */
export function gradientFillPs(grad: EpsGradient, ctx: ShadingCtx): string {
  const spec = resolveGradientSpec(grad, ctx);
  const fillOp = ctx.evenOdd === true ? "eofill" : "fill";
  if (spec.kind === "none") return "";
  if (spec.kind === "solid") return ` ${psColor(spec.color)} setrgbcolor ${fillOp}`;
  const clipOp = ctx.evenOdd === true ? "eoclip" : "clip";
  const coords = spec.kind === "radial"
    ? `${fmt(spec.fx)} ${fmt(spec.fy)} ${fmt(spec.fr)} ${fmt(spec.cx)} ${fmt(spec.cy)} ${fmt(spec.r)}`
    : `${fmt(spec.x1)} ${fmt(spec.y1)} ${fmt(spec.x2)} ${fmt(spec.y2)}`;
  const dict = `<< /ShadingType ${spec.kind === "radial" ? 3 : 2} /ColorSpace /DeviceRGB`
    + ` /Coords [${coords}] /Extend [true true] /Function ${functionPs(spec.stops)} >>`;
  return ` ${clipOp} newpath [${formatMatrix(spec.mat)}] concat ${dict} shfill`;
}

/** Expand a stroked shape into an exact closed cubic-Bezier vector outline (0 strokepath, 0 raster). */
export function expandGradientStroke(outline: Outline, stroke: StrokeExpandSpec): Outline {
  const pen: Pen = {
    width: stroke.width,
    cap: CAPS[stroke.cap] ?? "butt",
    join: JOINS[stroke.join] ?? "miter",
    miter: stroke.miter,
  };
  return expandOutline(outline, pen, dashSpecOf(stroke.dash, stroke.dashOffset));
}

function dashSpecOf(raw: number[] | null, offset: number): DashSpec {
  if (raw === null || raw.length === 0) return { pattern: null, offset };
  const pattern = raw.length % 2 === 1 ? [...raw, ...raw] : raw;
  const period = pattern.reduce((a, b) => a + b, 0);
  if (period === 0) return { pattern: null, offset };
  if (period < 0.01) throw new Unsupported("stroke-dasharray period under 0.01 px");
  return { pattern, offset };
}

function resolveLinear(grad: EpsGradient, ctx: ShadingCtx, mat: Matrix, stops: FlatStop[]): ResolvedGradient {
  const vb = ctx.viewBox;
  const x1 = coord(grad.attrs.x1, "0%", grad.units, [vb[0], vb[2]]);
  const y1 = coord(grad.attrs.y1, "0%", grad.units, [vb[1], vb[3]]);
  const x2 = coord(grad.attrs.x2, "100%", grad.units, [vb[0], vb[2]]);
  const y2 = coord(grad.attrs.y2, "0%", grad.units, [vb[1], vb[3]]);
  if (Math.hypot(x2 - x1, y2 - y1) < 1e-9) return { kind: "solid", color: stops[stops.length - 1].color };
  return { kind: "linear", mat, stops, x1, y1, x2, y2 };
}

function resolveRadial(grad: EpsGradient, ctx: ShadingCtx, mat: Matrix, stops: FlatStop[]): ResolvedGradient {
  const vb = ctx.viewBox;
  const cx = coord(grad.attrs.cx, "50%", grad.units, [vb[0], vb[2]]);
  const cy = coord(grad.attrs.cy, "50%", grad.units, [vb[1], vb[3]]);
  const diag = Math.hypot(vb[2], vb[3]) / Math.SQRT2;
  const r = coord(grad.attrs.r, "50%", grad.units, [0, diag]);
  if (r < 0) throw new Unsupported(`negative radialGradient radius: ${r}`);
  if (r === 0) return { kind: "solid", color: stops[stops.length - 1].color };
  const rawFx = grad.attrs.fx === undefined ? cx : coord(grad.attrs.fx, "50%", grad.units, [vb[0], vb[2]]);
  const rawFy = grad.attrs.fy === undefined ? cy : coord(grad.attrs.fy, "50%", grad.units, [vb[1], vb[3]]);
  const fr = Math.max(0, coord(grad.attrs.fr, "0%", grad.units, [0, diag]));
  const [fx, fy] = clampFocus([rawFx, rawFy], [cx, cy], r, fr);
  return { kind: "radial", mat, stops, fx, fy, fr, cx, cy, r };
}

function gradientMatrix(grad: EpsGradient, el: Element): Matrix {
  if (grad.units === "userSpaceOnUse") return grad.transform;
  const box: Bounds | null = localShapeBounds(el);
  if (box === null || !(box.width > 0) || !(box.height > 0)) {
    throw new Unsupported("objectBoundingBox gradient on a zero-area shape");
  }
  const unit: Matrix = { ...identity(), a: box.width, d: box.height, e: box.minX, f: box.minY };
  return multiply(unit, grad.transform);
}

function formatMatrix(m: Matrix): string {
  return `${fmt(m.a)} ${fmt(m.b)} ${fmt(m.c)} ${fmt(m.d)} ${fmt(m.e)} ${fmt(m.f)}`;
}

function clampFocus(f: [number, number], c: [number, number], r: number, fr: number): [number, number] {
  if (fr > 0) return f;
  const dx = f[0] - c[0];
  const dy = f[1] - c[1];
  const dist = Math.hypot(dx, dy);
  if (dist < r * 0.999) return f;
  const scale = (r * 0.999) / dist;
  return [c[0] + dx * scale, c[1] + dy * scale];
}

function coord(raw: string | undefined, fallback: string, units: EpsGradient["units"], span: [number, number]): number {
  const text = (raw ?? fallback).trim();
  const isPct = text.endsWith("%");
  const num = isPct ? Number(text.slice(0, -1)) / 100 : Number(text);
  if (!Number.isFinite(num)) throw new Unsupported(`invalid gradient coordinate: ${text}`);
  if (units === "objectBoundingBox") return num;
  return isPct ? span[0] + num * span[1] : num;
}

function functionPs(stops: FlatStop[]): string {
  if (stops.length === 2) return interpFn(stops[0].color, stops[1].color);
  const fns: string[] = [];
  const bounds: string[] = [];
  const encode: string[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    fns.push(interpFn(stops[i].color, stops[i + 1].color));
    if (i > 0) bounds.push(fmt(stops[i].offset));
    encode.push("0 1");
  }
  return `<< /FunctionType 3 /Domain [0 1] /Functions [${fns.join(" ")}] /Bounds [${bounds.join(" ")}] /Encode [${encode.join(" ")}] >>`;
}

function interpFn(c0: Rgb, c1: Rgb): string {
  return `<< /FunctionType 2 /Domain [0 1] /C0 [${psColor(c0)}] /C1 [${psColor(c1)}] /N 1 >>`;
}

function normalizeStops(stops: GradStop[], bg: Rgb, alpha: number): FlatStop[] {
  const padded = stops.map((s) => ({ offset: s.offset, color: mix(s.color, bg, s.opacity * alpha) }));
  if (padded[0].offset > 0) padded.unshift({ offset: 0, color: padded[0].color });
  if (padded[padded.length - 1].offset < 1) padded.push({ offset: 1, color: padded[padded.length - 1].color });
  let first = 0;
  while (first + 1 < padded.length && padded[first + 1].offset === 0) first++;
  let last = padded.length - 1;
  while (last - 1 > first && padded[last - 1].offset === 1) last--;
  const out: FlatStop[] = [padded[first]];
  for (let i = first + 1; i <= last; i++) {
    const prev = out[out.length - 1].offset;
    const maxAllowed = 1 - (last - i) * 1e-4;
    const offset = i === last ? 1 : Math.min(maxAllowed, Math.max(padded[i].offset, prev + 1e-4));
    out.push({ offset, color: padded[i].color });
  }
  return out;
}
