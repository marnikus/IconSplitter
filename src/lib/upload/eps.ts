// eps.ts — built-in 100%-vector EPS writer (`builtin-subset-5`, 0 raster, 0 `shfill`):
//  1) Layer 1: pure Level-2 vector paths + clipped Bezier gradient bands (`epsbands.ts`)
//  2) Layer 2: native Adobe Illustrator vector editing stream (`%AI9_DataStream`)
//     with live translucent Gradient Swatches, `Xy` opacity, and live strokes.

import { identity, multiply, parseTransform, type Matrix } from "./geom/matrix";
import { shapeOutline, type Outline } from "./geom/outline";
import { rectRadii } from "./geom/shapes";
import { inheritStroke, styleMap, type Stroke } from "./geom/stroke";
import { fmt } from "./geom";
import { AiStreamBuilder, type AiFill, type AiStroke } from "./epsai";
import { assemble, integerBounds, PX_TO_PT, uprightMatrix, type EpsBoundingBox, type EpsOptions } from "./epsdoc";
import {
  collectGradients, mix, opacityValue, paintColor, psColor, resolveGradient,
  Unsupported, urlRefId, type EpsGradient, type Rgb,
} from "./epsgradient";
import { outlineToPs } from "./epspath";
import { expandGradientStroke, gradientFillPs, resolveGradientSpec } from "./epsshading";

export { EPS10_MARKERS, verifyEps, verifyEpsDocument } from "./epsdoc";
export { inspectAiEps, verifyAiPrivateStream } from "./epsaicheck";
export type { AiGradientInfo, AiInspection, AiObjectInfo, AiStopInfo } from "./epsaicheck";
export type { EpsBoundingBox, EpsOptions, EpsVerification } from "./epsdoc";

const SHAPES = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"];
const CONTAINERS = ["svg", "g", "a", "switch"];
const SKIP = [
  "title", "desc", "metadata", "defs", "symbol", "clippath", "mask", "marker",
  "lineargradient", "radialgradient", "pattern", "filter", "script", "animate", "set",
];

export type EpsResult =
  | { ok: true; eps: string; boundingBox: EpsBoundingBox; shapes: number; fixes: string[] }
  | { ok: false; reason: string };

type PaintFill = Rgb | EpsGradient | null;

interface Paint {
  fill: PaintFill;
  stroke: PaintFill;
  strokeWidth: number;
  dash: number[] | null;
  dashOffset: number;
  cap: number;
  join: number;
  miter: number;
  fillOpacity: number;
  strokeOpacity: number;
  evenOdd: boolean;
}

interface WalkCtx {
  ctm: Matrix;
  upright: Matrix;
  paint: Paint;
  bg: Rgb;
  viewBox: number[];
  gradients: Map<string, Element>;
  body: string[];
  ai: AiStreamBuilder;
  count: { shapes: number; roundedRects: number };
}

/** The export SVG → a genuine 100%-vector Illustrator EPS document, or an honest subset failure. */
export function writeEps(svgText: string, background: string, opts: EpsOptions = {}): EpsResult {
  try {
    return writeEpsUnsafe(svgText, background, opts);
  } catch (error) {
    if (error instanceof Unsupported) return { ok: false, reason: error.message };
    throw error;
  }
}

function writeEpsUnsafe(svgText: string, background: string, opts: EpsOptions): EpsResult {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg") throw new Unsupported("not an SVG document");
  if (root.getAttribute("transform") !== null) throw new Unsupported("a transform on the root <svg> element");
  const vb = viewBoxOf(root);
  if (vb === null) throw new Unsupported("no viewBox on the root <svg>");
  const bg = paintColor(background);
  if (bg === null) throw new Unsupported(`unsupported background paint: ${background}`);
  const hires = { llx: 0, lly: 0, urx: vb[2] * PX_TO_PT, ury: vb[3] * PX_TO_PT };
  const box = integerBounds(hires);
  const ctx: WalkCtx = {
    ctm: identity(), upright: uprightMatrix(vb, hires), paint: basePaint(), bg, viewBox: vb,
    gradients: collectGradients(root), body: [], ai: new AiStreamBuilder(), count: { shapes: 0, roundedRects: 0 },
  };
  walk(root, ctx);
  const eps = assemble({ viewBox: vb, box, hires, body: ctx.body, trailer: ctx.ai.buildPrivateSection(box, hires, opts), opts });
  return { ok: true, eps, boundingBox: box, shapes: ctx.count.shapes, fixes: fixLines(ctx.count) };
}

function fixLines({ roundedRects: n }: WalkCtx["count"]): string[] {
  return n === 0 ? [] : [n === 1 ? "1 rounded <rect> written as an exact path outline" : `${n} rounded <rect>s written as exact path outlines`];
}

function walk(el: Element, ctx: WalkCtx): void {
  const tag = el.nodeName.toLowerCase();
  if (SKIP.includes(tag) || (el.getAttribute("display") ?? "").trim().toLowerCase() === "none") return;
  checkSupported(el);
  const next: WalkCtx = {
    ...ctx,
    ctm: multiply(ctx.ctm, parseTransform(el.getAttribute("transform"))),
    paint: resolvePaint(el, ctx.paint, ctx.gradients),
  };
  if (SHAPES.includes(tag)) emitShape(el, next);
  else if (CONTAINERS.includes(tag)) for (const child of Array.from(el.children)) walk(child, next);
  else throw new Unsupported(`<${tag}> is outside the EPS subset`);
}

function checkSupported(el: Element): void {
  if (el.nodeName.toLowerCase() === "style") throw new Unsupported("CSS <style> blocks are outside the EPS subset");
  if (el.getAttribute("opacity") !== null) throw new Unsupported("group opacity is outside the EPS subset");
  for (const effect of ["clip-path", "mask", "filter"]) {
    if (el.getAttribute(effect) !== null) throw new Unsupported(`\`${effect}\` is outside the EPS subset`);
  }
}

function emitShape(el: Element, ctx: WalkCtx): void {
  const outline = shapeOutline(el);
  if (outline === null) throw new Unsupported(`<${el.nodeName.toLowerCase()}> uses features outside the EPS subset`);
  const path = outlineToPs(outline);
  const fillPs = fillPaintPs(el, ctx);
  const strokeOut = emitStrokePs(el, outline, ctx);
  if (fillPs === "" && strokeOut === null) return;
  const m = `${fmt(ctx.ctm.a)} ${fmt(ctx.ctm.b)} ${fmt(ctx.ctm.c)} ${fmt(ctx.ctm.d)} ${fmt(ctx.ctm.e)} ${fmt(ctx.ctm.f)}`;
  ctx.body.push(`gsave\n[${m}] concat\n${combineShapePs(path, fillPs, strokeOut)}\ngrestore`);
  emitAiShape(el, outline, ctx);
  ctx.count.shapes++;
  if (isRoundedRect(el)) ctx.count.roundedRects++;
}

function combineShapePs(path: string, fillPs: string, strokeOut: { kind: "path" | "expanded"; ps: string } | null): string {
  if (strokeOut === null) return `${path}${fillPs}`;
  if (strokeOut.kind === "path") return `${path}${fillPs === "" ? "" : ` gsave${fillPs} grestore`}${strokeOut.ps}`;
  return fillPs === "" ? strokeOut.ps : `gsave ${path}${fillPs} grestore\n${strokeOut.ps}`;
}

function fillPaintPs(el: Element, ctx: WalkCtx): string {
  const { fill, fillOpacity, evenOdd } = ctx.paint;
  if (fill === null) return "";
  if ("kind" in fill) return gradientFillPs(fill, { el, viewBox: ctx.viewBox, bg: ctx.bg, alpha: fillOpacity, evenOdd });
  return ` ${psColor(mix(fill, ctx.bg, fillOpacity))} setrgbcolor ${evenOdd ? "eofill" : "fill"}`;
}

function emitStrokePs(el: Element, outline: Outline, ctx: WalkCtx): { kind: "path" | "expanded"; ps: string } | null {
  const { stroke, strokeOpacity } = ctx.paint;
  if (stroke === null || ctx.paint.strokeWidth <= 0) return null;
  if (!("kind" in stroke)) {
    return { kind: "path", ps: ` ${psColor(mix(stroke, ctx.bg, strokeOpacity))} setrgbcolor${strokeSetupPs(ctx.paint)} stroke` };
  }
  const expanded = expandGradientStroke(outline, strokeSpecOf(ctx.paint));
  if (expanded.ops.length === 0) return null;
  const fillPs = gradientFillPs(stroke, {
    el, viewBox: ctx.viewBox, bg: ctx.bg, alpha: strokeOpacity, evenOdd: false, targetOutline: expanded,
  });
  return fillPs === "" ? null : { kind: "expanded", ps: `${outlineToPs(expanded)}${fillPs}` };
}

function emitAiShape(el: Element, outline: Outline, ctx: WalkCtx): void {
  const toArt = multiply(ctx.upright, ctx.ctm);
  const fillSpec = resolveAiFill(el, ctx.paint.fill, ctx.paint.fillOpacity, ctx);
  const solidStroke = resolveSolidStroke(ctx.paint);
  addAiFillAndStroke(outline, toArt, ctx, { fillSpec, solidStroke });
  if (ctx.paint.stroke !== null && "kind" in ctx.paint.stroke && ctx.paint.strokeWidth > 0) {
    const strokeFill = resolveAiFill(el, ctx.paint.stroke, ctx.paint.strokeOpacity, ctx);
    const expanded = expandGradientStroke(outline, strokeSpecOf(ctx.paint));
    if (strokeFill !== null && expanded.ops.length > 0) {
      ctx.ai.addShape({ outline: expanded, toArt, evenOdd: false, opacity: strokeFill.opacity, fill: strokeFill.fill, stroke: null });
    }
  }
}

function addAiFillAndStroke(
  outline: Outline, toArt: Matrix, ctx: WalkCtx,
  parts: { fillSpec: { fill: AiFill; opacity: number } | null; solidStroke: AiStroke | null },
): void {
  const { fillSpec, solidStroke } = parts;
  const strokeOp = ctx.paint.strokeOpacity;
  if (fillSpec !== null && solidStroke !== null && Math.abs(fillSpec.opacity - strokeOp) > 1e-6) {
    ctx.ai.addShape({ outline, toArt, evenOdd: ctx.paint.evenOdd, opacity: fillSpec.opacity, fill: fillSpec.fill, stroke: null });
    ctx.ai.addShape({ outline, toArt, evenOdd: ctx.paint.evenOdd, opacity: strokeOp, fill: null, stroke: solidStroke });
    return;
  }
  if (fillSpec !== null || solidStroke !== null) {
    const opacity = fillSpec !== null ? fillSpec.opacity : strokeOp;
    ctx.ai.addShape({ outline, toArt, evenOdd: ctx.paint.evenOdd, opacity, fill: fillSpec?.fill ?? null, stroke: solidStroke });
  }
}

function resolveAiFill(el: Element, paint: PaintFill, alpha: number, ctx: WalkCtx): { fill: AiFill; opacity: number } | null {
  if (paint === null) return null;
  if (!("kind" in paint)) return { fill: { kind: "solid", color: paint }, opacity: alpha };
  const spec = resolveGradientSpec(paint, { el, viewBox: ctx.viewBox, bg: ctx.bg, alpha });
  if (spec.kind === "none") return null;
  if (spec.kind === "solid") return { fill: { kind: "solid", color: spec.liveColor }, opacity: spec.opacity };
  return { fill: spec, opacity: spec.opacity };
}

function resolveSolidStroke(paint: Paint): AiStroke | null {
  if (paint.stroke === null || "kind" in paint.stroke || paint.strokeWidth <= 0) return null;
  return {
    color: paint.stroke, width: paint.strokeWidth,
    cap: paint.cap, join: paint.join, miter: paint.miter, dash: paint.dash, dashOffset: paint.dashOffset,
  };
}

function strokeSpecOf(p: Paint) {
  return { width: p.strokeWidth, cap: p.cap, join: p.join, miter: p.miter, dash: p.dash, dashOffset: p.dashOffset };
}

function strokeSetupPs(paint: Paint): string {
  const dash = paint.dash === null ? "" : ` [${paint.dash.map(fmt).join(" ")}] ${fmt(paint.dashOffset)} setdash`;
  return ` ${fmt(paint.strokeWidth)} setlinewidth${dash}`
    + ` ${paint.cap} setlinecap ${paint.join} setlinejoin ${fmt(paint.miter)} setmiterlimit`;
}

function isRoundedRect(el: Element): boolean {
  if (el.nodeName.toLowerCase() !== "rect") return false;
  const [rx, ry] = rectRadii(el, Number(el.getAttribute("width")), Number(el.getAttribute("height")));
  return rx > 0 && ry > 0;
}

function basePaint(): Paint {
  return {
    fill: { r: 0, g: 0, b: 0 }, stroke: null, strokeWidth: 1, dash: null, dashOffset: 0,
    cap: 0, join: 0, miter: 4, fillOpacity: 1, strokeOpacity: 1, evenOdd: false,
  };
}

function resolvePaint(el: Element, parent: Paint, gradients: Map<string, Element>): Paint {
  const style = styleMap(el.getAttribute("style"));
  const attr = (key: string) => style[key] ?? el.getAttribute(key);
  const stroke = inheritStroke(el, strokeOf(parent));
  const fillRaw = attr("fill");
  const strokeRaw = attr("stroke");
  return {
    fill: fillRaw === null || fillRaw === "" ? parent.fill : paintSpec(fillRaw, gradients),
    stroke: strokeRaw === null || strokeRaw === "" ? parent.stroke : paintSpec(strokeRaw, gradients),
    strokeWidth: stroke.width, dash: dashOf(attr("stroke-dasharray")),
    dashOffset: dashOffsetOf(attr("stroke-dashoffset"), parent.dashOffset),
    cap: capOf(attr("stroke-linecap"), stroke.cap), join: joinOf(attr("stroke-linejoin"), stroke.join),
    miter: stroke.miter, fillOpacity: opacityValue(attr("fill-opacity"), parent.fillOpacity),
    strokeOpacity: opacityValue(attr("stroke-opacity"), parent.strokeOpacity),
    evenOdd: (attr("fill-rule") ?? (parent.evenOdd ? "evenodd" : "nonzero")).trim().toLowerCase() === "evenodd",
  };
}

function dashOffsetOf(raw: string | null, inherited: number): number {
  if (raw === null || raw.trim() === "") return inherited;
  const val = Number(raw.trim().replace(/px$/i, ""));
  if (!Number.isFinite(val)) throw new Unsupported(`unsupported stroke-dashoffset: ${raw}`);
  return val;
}

function paintSpec(raw: string, gradients: Map<string, Element>): PaintFill {
  const id = urlRefId(raw);
  return id !== null ? resolveGradient(id, gradients) : paintColor(raw);
}

function strokeOf(p: Paint): Stroke {
  const none = p.stroke === null;
  return { width: p.strokeWidth, paint: none ? "none" : "rgb", none, fillNone: p.fill === null, cap: "butt", join: "miter", miter: p.miter };
}

function dashOf(raw: string | null): number[] | null {
  if (raw === null || raw.trim() === "" || raw.trim().toLowerCase() === "none") return null;
  const dashes = raw.trim().split(/[\s,]+/).map(Number);
  if (dashes.some((d) => !Number.isFinite(d) || d < 0)) throw new Unsupported(`unsupported dash: ${raw}`);
  return dashes;
}

function capOf(raw: string | null, inherited: string): number {
  const text = (raw ?? inherited).trim().toLowerCase();
  if (text === "round") return 1;
  if (text === "square") return 2;
  if (text === "butt" || text === "") return 0;
  throw new Unsupported(`unsupported stroke-linecap: ${text}`);
}

function joinOf(raw: string | null, inherited: string): number {
  const text = (raw ?? inherited).trim().toLowerCase();
  if (text === "round") return 1;
  if (text === "bevel") return 2;
  if (text === "miter" || text === "") return 0;
  throw new Unsupported(`unsupported stroke-linejoin: ${text}`);
}

function viewBoxOf(root: Element): number[] | null {
  const raw = root.getAttribute("viewBox");
  if (raw === null) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts[2] > 0 && parts[3] > 0 ? parts : null;
}
