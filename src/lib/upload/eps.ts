// eps.ts — the genuine EPS writer for the "SVG to upload" tab
// (design §2.5): a documented SUBSET of SVG → real PostScript, written as an
// **EPS 10 / Illustrator-10-compatible** document (2026-10-08): the full DSC
// comment block stock sites and Illustrator expect — `%!PS-Adobe-3.0 EPSF-3.0`,
// `%%BoundingBox` AND `%%HiResBoundingBox`, `%%DocumentData: Clean7Bit`,
// `%%LanguageLevel: 3`, `%%Creator/%%Title/%%CreationDate`, the Prolog/Setup
// sections — never a renamed PS/PDF. The conversion consumes the OPTIMIZED,
// cleaned export SVG (the pipeline runs it after prepare → optimize → clean),
// so what Illustrator opens is what the package ships.
//
// Subset: path/rect/circle/ellipse/line/polyline/polygon; solid fill/stroke
// (hex, rgb(), the 16 basic names) AND native LanguageLevel-3 vector linear /
// radial gradients (`shfill`, ShadingType 2/3, FunctionType 2/3, stop/paint
// opacity mixed onto the solid export background); dash; linecap/linejoin/
// miterlimit; transforms replayed through the CTM; `display:none` subtrees
// skipped. A rounded rect is drawn exactly (four lines, four arcs — 2026-10-08)
// and REPORTED as an automatic fix (`fixes`), never asked about. ANYTHING else
// — patterns, text, images, filters, clips, CSS `<style>`, group opacity,
// unresolved/unknown paints — fails the EPS stage honestly (`partial`).

import { identity, multiply, parseTransform, type Matrix } from "./geom/matrix";
import { inheritStroke, styleMap, type Stroke } from "./geom/stroke";
import { shapePathPs } from "./epspath";
import { rectRadii } from "./geom/shapes";
import { fmt } from "./geom";
import { assemble, integerBounds, PX_TO_PT, type EpsBoundingBox, type EpsOptions } from "./epsdoc";
import {
  collectGradients, mix, opacityValue, paintColor, psColor, resolveGradient,
  Unsupported, urlRefId, type EpsGradient, type Rgb,
} from "./epsgradient";
import { gradientFillPs, gradientStrokePs } from "./epsshading";

export { EPS10_MARKERS, verifyEps, verifyEpsDocument } from "./epsdoc";
export type { EpsBoundingBox, EpsOptions, EpsVerification } from "./epsdoc";

const SHAPES = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"];
const CONTAINERS = ["svg", "g", "a", "switch"];
/** Non-rendered subtrees the writer skips silently (their content never paints). */
const SKIP = [
  "title", "desc", "metadata", "defs", "symbol", "clippath", "mask", "marker",
  "lineargradient", "radialgradient", "pattern", "filter", "script", "animate", "set",
];

export type EpsResult =
  /** `fixes`: what the writer adjusted on its own, said in one line each (2026-10-08) — never a confirmation to ask. */
  | { ok: true; eps: string; boundingBox: EpsBoundingBox; shapes: number; fixes: string[] }
  | { ok: false; reason: string };

/** The export SVG → a genuine EPS 10 document, or an honest subset failure. */
export function writeEps(svgText: string, background: string, opts: EpsOptions = {}): EpsResult {
  try {
    return writeEpsUnsafe(svgText, background, opts);
  } catch (error) {
    if (error instanceof Unsupported) return { ok: false, reason: error.message };
    throw error;
  }
}

type PaintFill = Rgb | EpsGradient | null;

interface Paint {
  fill: PaintFill;
  stroke: PaintFill;
  strokeWidth: number;
  dash: number[] | null;
  cap: number;
  join: number;
  miter: number;
  fillOpacity: number;
  strokeOpacity: number;
}

interface WalkCtx {
  ctm: Matrix;
  paint: Paint;
  bg: Rgb;
  viewBox: number[];
  gradients: Map<string, Element>;
  body: string[];
  count: { shapes: number; roundedRects: number };
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
  const ctx: WalkCtx = {
    ctm: identity(), paint: basePaint(), bg, viewBox: vb,
    gradients: collectGradients(root), body: [], count: { shapes: 0, roundedRects: 0 },
  };
  walk(root, ctx);
  const hires = { llx: 0, lly: 0, urx: vb[2] * PX_TO_PT, ury: vb[3] * PX_TO_PT };
  const box = integerBounds(hires);
  const eps = assemble({ viewBox: vb, box, hires, body: ctx.body, opts });
  return { ok: true, eps, boundingBox: box, shapes: ctx.count.shapes, fixes: fixLines(ctx.count) };
}

function fixLines(count: WalkCtx["count"]): string[] {
  const n = count.roundedRects;
  if (n === 0) return [];
  return [n === 1 ? "1 rounded <rect> written as an exact path outline" : `${n} rounded <rect>s written as exact path outlines`];
}

function walk(el: Element, ctx: WalkCtx): void {
  const tag = el.nodeName.toLowerCase();
  if (SKIP.includes(tag) || displayNone(el)) return;
  checkSupported(el);
  const next: WalkCtx = {
    ...ctx,
    ctm: multiply(ctx.ctm, parseTransform(el.getAttribute("transform"))),
    paint: resolvePaint(el, ctx.paint, ctx.gradients),
  };
  if (SHAPES.includes(tag)) emitShape(el, next, ctx);
  else if (CONTAINERS.includes(tag)) walkChildren(el, next);
  else throw new Unsupported(`<${tag}> is outside the EPS subset`);
}

function walkChildren(el: Element, ctx: WalkCtx): void {
  for (const child of Array.from(el.children)) walk(child, ctx);
}

function displayNone(el: Element): boolean {
  return (el.getAttribute("display") ?? "").trim().toLowerCase() === "none";
}

function checkSupported(el: Element): void {
  if (el.nodeName.toLowerCase() === "style") throw new Unsupported("CSS <style> blocks are outside the EPS subset");
  if (el.getAttribute("opacity") !== null) throw new Unsupported("group opacity is outside the EPS subset");
  for (const effect of ["clip-path", "mask", "filter"]) {
    if (el.getAttribute(effect) !== null) throw new Unsupported(`\`${effect}\` is outside the EPS subset`);
  }
}

function emitShape(el: Element, ctx: WalkCtx, out: WalkCtx): void {
  const path = shapePathPs(el);
  if (path === null) throw new Unsupported(`<${el.nodeName.toLowerCase()}> uses features outside the EPS subset`);
  const fillPs = fillPaintPs(el, ctx);
  const strokePaintPs = strokePs(el, ctx);
  if (fillPs === "" && strokePaintPs === "") return;
  const m = `${fmt(ctx.ctm.a)} ${fmt(ctx.ctm.b)} ${fmt(ctx.ctm.c)} ${fmt(ctx.ctm.d)} ${fmt(ctx.ctm.e)} ${fmt(ctx.ctm.f)}`;
  const paints = strokePaintPs === "" ? fillPs : `${fillPs === "" ? "" : ` gsave${fillPs} grestore`}${strokePaintPs}`;
  out.body.push(`gsave\n[${m}] concat\n${path}${paints}\ngrestore`);
  out.count.shapes++;
  if (isRoundedRect(el)) out.count.roundedRects++;
}

function fillPaintPs(el: Element, ctx: WalkCtx): string {
  const { fill, fillOpacity } = ctx.paint;
  if (fill === null) return "";
  if ("kind" in fill) return gradientFillPs(fill, { el, viewBox: ctx.viewBox, bg: ctx.bg, alpha: fillOpacity });
  return ` ${psColor(mix(fill, ctx.bg, fillOpacity))} setrgbcolor fill`;
}

function strokePs(el: Element, ctx: WalkCtx): string {
  const { stroke, strokeOpacity } = ctx.paint;
  if (stroke === null) return "";
  const setup = strokeSetupPs(ctx.paint);
  if ("kind" in stroke) return gradientStrokePs(stroke, setup, { el, viewBox: ctx.viewBox, bg: ctx.bg, alpha: strokeOpacity });
  return ` ${psColor(mix(stroke, ctx.bg, strokeOpacity))} setrgbcolor${setup} stroke`;
}

function strokeSetupPs(paint: Paint): string {
  const dash = paint.dash === null ? "" : ` [${paint.dash.map(fmt).join(" ")}] 0 setdash`;
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
    fill: { r: 0, g: 0, b: 0 }, stroke: null, strokeWidth: 1, dash: null,
    cap: 0, join: 0, miter: 4, fillOpacity: 1, strokeOpacity: 1,
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
    strokeWidth: stroke.width,
    dash: dashOf(attr("stroke-dasharray")),
    cap: capOf(attr("stroke-linecap"), stroke.cap),
    join: joinOf(attr("stroke-linejoin"), stroke.join),
    miter: stroke.miter,
    fillOpacity: opacityValue(attr("fill-opacity"), parent.fillOpacity),
    strokeOpacity: opacityValue(attr("stroke-opacity"), parent.strokeOpacity),
  };
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
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n)) || nums[2] <= 0 || nums[3] <= 0) return null;
  return nums;
}
