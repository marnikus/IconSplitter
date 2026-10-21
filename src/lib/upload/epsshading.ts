// epsshading.ts — PostScript LanguageLevel 3 smooth shadings (`shfill`) for
// SVG <linearGradient> (/ShadingType 2) and <radialGradient> (/ShadingType 3).

import { fmt } from "./geom";
import { localShapeBounds, type Bounds } from "./geom/bounds";
import { identity, multiply, type Matrix } from "./geom/matrix";
import { mix, psColor, Unsupported, type EpsGradient, type GradStop, type Rgb } from "./epsgradient";

interface ShadingCtx {
  el: Element;
  viewBox: number[];
  bg: Rgb;
  alpha: number;
}

/** Emit PostScript for a gradient fill on the current path, or `""` for 0 stops. */
export function gradientFillPs(grad: EpsGradient, ctx: ShadingCtx): string {
  if (grad.stops.length === 0) return "";
  if (grad.stops.length === 1) {
    const s = grad.stops[0];
    return ` ${psColor(mix(s.color, ctx.bg, s.opacity * ctx.alpha))} setrgbcolor fill`;
  }
  const spec = shadingDictPs(grad, ctx);
  if (spec.solid !== null) return ` ${psColor(spec.solid)} setrgbcolor fill`;
  return ` clip newpath [${spec.matrix}] concat ${spec.dict} shfill`;
}

/** Emit PostScript for a gradient stroke on the current path, or `""` for 0 stops. */
export function gradientStrokePs(grad: EpsGradient, strokeSetup: string, ctx: ShadingCtx): string {
  if (grad.stops.length === 0) return "";
  if (grad.stops.length === 1) {
    const s = grad.stops[0];
    return ` ${psColor(mix(s.color, ctx.bg, s.opacity * ctx.alpha))} setrgbcolor${strokeSetup} stroke`;
  }
  const spec = shadingDictPs(grad, ctx);
  if (spec.solid !== null) return ` ${psColor(spec.solid)} setrgbcolor${strokeSetup} stroke`;
  return `${strokeSetup} strokepath clip newpath [${spec.matrix}] concat ${spec.dict} shfill`;
}

interface ShadingSpec {
  solid: Rgb | null;
  matrix: string;
  dict: string;
}

function shadingDictPs(grad: EpsGradient, ctx: ShadingCtx): ShadingSpec {
  const mat = gradientMatrix(grad, ctx.el);
  const fn = functionPs(grad.stops, ctx.bg, ctx.alpha);
  const coords = grad.kind === "radial" ? radialCoords(grad, ctx.viewBox) : linearCoords(grad, ctx.viewBox);
  if (coords === null) {
    const last = grad.stops[grad.stops.length - 1];
    return { solid: mix(last.color, ctx.bg, last.opacity * ctx.alpha), matrix: "", dict: "" };
  }
  const type = grad.kind === "radial" ? 3 : 2;
  const dict = `<< /ShadingType ${type} /ColorSpace /DeviceRGB /Coords [${coords}] /Extend [true true] /Function ${fn} >>`;
  return { solid: null, matrix: formatMatrix(mat), dict };
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

function linearCoords(grad: EpsGradient, vb: number[]): string | null {
  const x1 = coord(grad.attrs.x1, "0%", grad.units, [vb[0], vb[2]]);
  const y1 = coord(grad.attrs.y1, "0%", grad.units, [vb[1], vb[3]]);
  const x2 = coord(grad.attrs.x2, "100%", grad.units, [vb[0], vb[2]]);
  const y2 = coord(grad.attrs.y2, "0%", grad.units, [vb[1], vb[3]]);
  if (Math.hypot(x2 - x1, y2 - y1) < 1e-9) return null;
  return `${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)}`;
}

function radialCoords(grad: EpsGradient, vb: number[]): string | null {
  const cx = coord(grad.attrs.cx, "50%", grad.units, [vb[0], vb[2]]);
  const cy = coord(grad.attrs.cy, "50%", grad.units, [vb[1], vb[3]]);
  const diag = Math.hypot(vb[2], vb[3]) / Math.SQRT2;
  const r = coord(grad.attrs.r, "50%", grad.units, [0, diag]);
  if (r < 0) throw new Unsupported(`negative radialGradient radius: ${r}`);
  if (r === 0) return null;
  const rawFx = grad.attrs.fx === undefined ? cx : coord(grad.attrs.fx, "50%", grad.units, [vb[0], vb[2]]);
  const rawFy = grad.attrs.fy === undefined ? cy : coord(grad.attrs.fy, "50%", grad.units, [vb[1], vb[3]]);
  const fr = coord(grad.attrs.fr, "0%", grad.units, [0, diag]);
  const [fx, fy] = clampFocus([rawFx, rawFy], [cx, cy], r, fr);
  return `${fmt(fx)} ${fmt(fy)} ${fmt(Math.max(0, fr))} ${fmt(cx)} ${fmt(cy)} ${fmt(r)}`;
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

interface FlatStop { offset: number; color: Rgb }

function functionPs(stops: GradStop[], bg: Rgb, alpha: number): string {
  const norm = normalizeStops(stops.map((s) => ({ offset: s.offset, color: mix(s.color, bg, s.opacity * alpha) })));
  if (norm.length === 2) return interpFn(norm[0].color, norm[1].color);
  const fns: string[] = [];
  const bounds: string[] = [];
  const encode: string[] = [];
  for (let i = 0; i + 1 < norm.length; i++) {
    fns.push(interpFn(norm[i].color, norm[i + 1].color));
    if (i > 0) bounds.push(fmt(norm[i].offset));
    encode.push("0 1");
  }
  return `<< /FunctionType 3 /Domain [0 1] /Functions [${fns.join(" ")}] /Bounds [${bounds.join(" ")}] /Encode [${encode.join(" ")}] >>`;
}

function interpFn(c0: Rgb, c1: Rgb): string {
  return `<< /FunctionType 2 /Domain [0 1] /C0 [${psColor(c0)}] /C1 [${psColor(c1)}] /N 1 >>`;
}

function normalizeStops(raw: FlatStop[]): FlatStop[] {
  const padded = [...raw];
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
