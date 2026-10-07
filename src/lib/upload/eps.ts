// eps.ts — the genuine EPS writer for the "SVG to upload" tab
// (design §2.5): a documented SUBSET of SVG → real PostScript
// (`%!PS-Adobe-3.0 EPSF-3.0` + `%%BoundingBox`), never a renamed PS/PDF.
//
// Subset: path/rect/circle/ellipse/line/polyline/polygon; solid fill/stroke
// (hex, rgb(), the 16 basic names); dash; linecap/linejoin/miterlimit;
// transforms replayed through the CTM; fill/stroke-opacity flattened onto
// the export background; `display:none` subtrees skipped. ANYTHING else —
// gradients, text, images, filters, clips, CSS `<style>`, group opacity,
// rounded rects, unknown paints — fails the EPS stage honestly (the row goes
// `partial`; the SVG/JPEG outputs stay committed). Coordinates: SVG user
// units (px at 96 DPI) → PostScript points (0.75), y flipped once up front.

import { identity, multiply, parseTransform, type Matrix } from "./geom/matrix";
import { inheritStroke, styleMap, type Stroke } from "./geom/stroke";
import { shapePathPs } from "./epspath";
import { fmt } from "./geom";

const PX_TO_PT = 0.75;

const SHAPES = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"];
const CONTAINERS = ["svg", "g", "a", "switch"];
/** Non-rendered subtrees the writer skips silently (their content never paints). */
const SKIP = [
  "title", "desc", "metadata", "defs", "symbol", "clippath", "mask", "marker",
  "lineargradient", "radialgradient", "pattern", "filter", "script", "animate", "set",
];

export interface EpsBoundingBox { llx: number; lly: number; urx: number; ury: number }

export type EpsResult =
  | { ok: true; eps: string; boundingBox: EpsBoundingBox; shapes: number }
  | { ok: false; reason: string };

export interface EpsVerification {
  ok: boolean;
  errors: string[];
  boundingBox: EpsBoundingBox | null;
}

/** The export SVG → a genuine EPS document, or an honest subset failure. */
export function writeEps(svgText: string, background: string): EpsResult {
  try {
    return writeEpsUnsafe(svgText, background);
  } catch (error) {
    if (error instanceof Unsupported) return { ok: false, reason: error.message };
    throw error;
  }
}

/** Verifies an EPS document: header, integer bounding box, %%EOF. */
export function verifyEps(eps: string): EpsVerification {
  const errors: string[] = [];
  if (!eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")) errors.push("missing %!PS-Adobe-3.0 EPSF-3.0 header");
  const m = /^%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/m.exec(eps);
  if (m === null) errors.push("missing or malformed %%BoundingBox");
  if (!eps.trimEnd().endsWith("%%EOF")) errors.push("missing %%EOF");
  const box = m === null ? null : { llx: +m[1], lly: +m[2], urx: +m[3], ury: +m[4] };
  return { ok: errors.length === 0, errors, boundingBox: box };
}

class Unsupported extends Error {}

interface Rgb { r: number; g: number; b: number }

interface Paint {
  fill: Rgb | null;
  stroke: Rgb | null;
  strokeWidth: number;
  dash: number[] | null;
  cap: number;
  join: number;
  miter: number;
  fillOpacity: number;
  strokeOpacity: number;
}

function writeEpsUnsafe(svgText: string, background: string): EpsResult {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg") throw new Unsupported("not an SVG document");
  if (root.getAttribute("transform") !== null) throw new Unsupported("a transform on the root <svg> element");
  const vb = viewBoxOf(root);
  if (vb === null) throw new Unsupported("no viewBox on the root <svg>");
  const bg = paintOf(background);
  if (bg === null) throw new Unsupported(`unsupported background paint: ${background}`);
  const ctx: WalkCtx = { ctm: identity(), paint: basePaint(), bg, body: [], count: { shapes: 0 } };
  walk(root, ctx);
  const box = { llx: 0, lly: 0, urx: Math.ceil(vb[2] * PX_TO_PT), ury: Math.ceil(vb[3] * PX_TO_PT) };
  return { ok: true, eps: assemble(vb, box, ctx.body), boundingBox: box, shapes: ctx.count.shapes };
}

function assemble(vb: number[], box: EpsBoundingBox, body: string[]): string {
  const header = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: ${box.llx} ${box.lly} ${box.urx} ${box.ury}`,
    "%%Creator: IconSplitter (SVG to upload)",
    "%%EndComments",
    `${fmt(PX_TO_PT)} 0 0 ${fmt(-PX_TO_PT)} ${fmt(-PX_TO_PT * vb[0])} ${fmt(PX_TO_PT * (vb[1] + vb[3]))} concat`,
  ].join("\n");
  return `${header}\n${body.join("\n")}\n%%EOF\n`;
}

/** The walk state: CTM + paint cascade in, emitted PS and shape count out. */
interface WalkCtx {
  ctm: Matrix;
  paint: Paint;
  bg: Rgb;
  body: string[];
  count: { shapes: number };
}

function walk(el: Element, ctx: WalkCtx): void {
  const tag = el.nodeName.toLowerCase();
  if (SKIP.includes(tag)) return;
  if (displayNone(el)) return;
  checkSupported(el);
  const next: WalkCtx = { ...ctx, ctm: multiply(ctx.ctm, parseTransform(el.getAttribute("transform"))), paint: resolvePaint(el, ctx.paint) };
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

/** The subset checks that fail the stage honestly (never guessed). */
function checkSupported(el: Element): void {
  if (el.nodeName.toLowerCase() === "style") throw new Unsupported("CSS <style> blocks are outside the EPS subset");
  if (el.getAttribute("opacity") !== null) throw new Unsupported("group opacity is outside the EPS subset");
  for (const effect of ["clip-path", "mask", "filter"]) {
    if (el.getAttribute(effect) !== null) throw new Unsupported(`\`${effect}\` is outside the EPS subset`);
  }
}

/** One shape: gsave, CTM, path, fill, stroke, grestore. */
function emitShape(el: Element, ctx: WalkCtx, out: WalkCtx): void {
  const path = shapePathPs(el);
  if (path === null) throw new Unsupported(`<${el.nodeName.toLowerCase()}> uses features outside the EPS subset`);
  const m = `${fmt(ctx.ctm.a)} ${fmt(ctx.ctm.b)} ${fmt(ctx.ctm.c)} ${fmt(ctx.ctm.d)} ${fmt(ctx.ctm.e)} ${fmt(ctx.ctm.f)}`;
  const fill = ctx.paint.fill === null ? "" : ` ${psColor(mix(ctx.paint.fill, ctx.bg, ctx.paint.fillOpacity))} setrgbcolor fill`;
  const stroke = ctx.paint.stroke === null ? "" : strokePs(ctx.paint, ctx.bg);
  out.body.push(`gsave\n[${m}] concat\n${path}${fill}${stroke}\ngrestore`);
  out.count.shapes++;
}

function strokePs(paint: Paint, bg: Rgb): string {
  const dash = paint.dash === null ? "" : ` [${paint.dash.map(fmt).join(" ")}] 0 setdash`;
  return ` ${psColor(mix(paint.stroke as Rgb, bg, paint.strokeOpacity))} setrgbcolor`
    + ` ${fmt(paint.strokeWidth)} setlinewidth${dash}`
    + ` ${paint.cap} setlinecap ${paint.join} setlinejoin ${fmt(paint.miter)} setmiterlimit stroke`;
}

// --- paint --------------------------------------------------------------------

const NAMED: Record<string, Rgb> = {
  black: { r: 0, g: 0, b: 0 }, white: { r: 1, g: 1, b: 1 }, red: { r: 1, g: 0, b: 0 },
  green: { r: 0, g: 0.5, b: 0 }, blue: { r: 0, g: 0, b: 1 }, yellow: { r: 1, g: 1, b: 0 },
  cyan: { r: 0, g: 1, b: 1 }, magenta: { r: 1, g: 0, b: 1 }, gray: { r: 0.5, g: 0.5, b: 0.5 },
  grey: { r: 0.5, g: 0.5, b: 0.5 }, silver: { r: 0.75, g: 0.75, b: 0.75 }, maroon: { r: 0.5, g: 0, b: 0 },
  navy: { r: 0, g: 0, b: 0.5 }, olive: { r: 0.5, g: 0.5, b: 0 }, purple: { r: 0.5, g: 0, b: 0.5 },
  teal: { r: 0, g: 0.5, b: 0.5 }, aqua: { r: 0, g: 1, b: 1 }, fuchsia: { r: 1, g: 0, b: 1 },
  lime: { r: 0, g: 1, b: 0 },
};

function basePaint(): Paint {
  return {
    fill: { r: 0, g: 0, b: 0 }, stroke: null, strokeWidth: 1, dash: null,
    cap: 0, join: 0, miter: 4, fillOpacity: 1, strokeOpacity: 1,
  };
}

/** The paint state at an element: cascade + subset checks (throws Unsupported). */
function resolvePaint(el: Element, parent: Paint): Paint {
  const style = styleMap(el.getAttribute("style"));
  const attr = (key: string) => style[key] ?? el.getAttribute(key);
  const stroke = inheritStroke(el, strokeOf(parent));
  const fillRaw = attr("fill");
  const strokeRaw = attr("stroke");
  return {
    fill: fillRaw === null || fillRaw === "" ? parent.fill : paintOf(fillRaw),
    stroke: strokeRaw === null || strokeRaw === "" ? parent.stroke : paintOf(strokeRaw),
    strokeWidth: stroke.width,
    dash: dashOf(attr("stroke-dasharray")),
    cap: capOf(attr("stroke-linecap"), stroke.cap),
    join: joinOf(attr("stroke-linejoin"), stroke.join),
    miter: stroke.miter,
    fillOpacity: opacityOf(attr("fill-opacity"), parent.fillOpacity),
    strokeOpacity: opacityOf(attr("stroke-opacity"), parent.strokeOpacity),
  };
}

function strokeOf(p: Paint): Stroke {
  return { width: p.strokeWidth, none: p.stroke === null, cap: "butt", join: "miter", miter: p.miter };
}

/** A paint keyword → RGB; "none" → null; anything else → Unsupported. */
function paintOf(raw: string): Rgb | null {
  const text = raw.trim().toLowerCase();
  if (text === "none") return null;
  if (text.startsWith("#")) return hexPaint(text);
  const fn = /^rgba?\(([^)]*)\)$/.exec(text);
  if (fn !== null) return rgbPaint(fn[1]);
  const named = NAMED[text];
  if (named !== undefined) return named;
  throw new Unsupported(`unsupported paint: ${raw.trim()}`);
}

function hexPaint(text: string): Rgb {
  const hex = text.slice(1);
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(hex)) throw new Unsupported(`unsupported paint: ${text}`);
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

function rgbPaint(args: string): Rgb {
  const parts = args.split(/[\s,]+/).filter((p) => p !== "");
  if (parts.length !== 3) throw new Unsupported(`unsupported paint: rgb(${args})`);
  const channels = parts.map((p) => (p.endsWith("%") ? Number(p.slice(0, -1)) / 100 : Number(p) / 255));
  if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) {
    throw new Unsupported(`unsupported paint: rgb(${args})`);
  }
  return { r: channels[0], g: channels[1], b: channels[2] };
}

function dashOf(raw: string | null): number[] | null {
  if (raw === null || raw.trim() === "" || raw.trim().toLowerCase() === "none") return null;
  const dashes = raw.trim().split(/[\s,]+/).map(Number);
  if (dashes.some((d) => !Number.isFinite(d) || d < 0)) throw new Unsupported(`unsupported dash: ${raw}`);
  return dashes;
}

function opacityOf(raw: string | null, inherited: number): number {
  if (raw === null || raw.trim() === "") return inherited;
  const text = raw.trim();
  const value = text.endsWith("%") ? Number(text.slice(0, -1)) / 100 : Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Unsupported(`unsupported opacity: ${raw}`);
  return value;
}

/** PS linecap: butt 0, round 1, square 2 (SVG keyword → PostScript). */
function capOf(raw: string | null, inherited: string): number {
  const text = (raw ?? inherited).trim().toLowerCase();
  if (text === "round") return 1;
  if (text === "square") return 2;
  if (text === "butt" || text === "") return 0;
  throw new Unsupported(`unsupported stroke-linecap: ${text}`);
}

/** PS linejoin: miter 0, round 1, bevel 2 (SVG keyword → PostScript). */
function joinOf(raw: string | null, inherited: string): number {
  const text = (raw ?? inherited).trim().toLowerCase();
  if (text === "round") return 1;
  if (text === "bevel") return 2;
  if (text === "miter" || text === "") return 0;
  throw new Unsupported(`unsupported stroke-linejoin: ${text}`);
}

/** Opacity flattened onto the export background (PostScript has no alpha). */
function mix(color: Rgb, bg: Rgb, alpha: number): Rgb {
  return {
    r: alpha * color.r + (1 - alpha) * bg.r,
    g: alpha * color.g + (1 - alpha) * bg.g,
    b: alpha * color.b + (1 - alpha) * bg.b,
  };
}

function psColor(c: Rgb): string {
  return `${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)}`;
}

function viewBoxOf(root: Element): number[] | null {
  const raw = root.getAttribute("viewBox");
  if (raw === null) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n)) || nums[2] <= 0 || nums[3] <= 0) return null;
  return nums;
}
