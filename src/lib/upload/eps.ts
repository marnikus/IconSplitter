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
// (hex, rgb(), the 16 basic names); dash; linecap/linejoin/miterlimit;
// transforms replayed through the CTM; fill/stroke-opacity flattened onto
// the export background; `display:none` subtrees skipped. A rounded rect is
// drawn exactly (four lines, four arcs — 2026-10-08) and REPORTED as an
// automatic fix (`fixes`), never asked about. Level 3 linear/radial gradients use vector shadings; text,
// images, filters, external clips, CSS `<style>`, group opacity, unknown paints — fails
// the EPS stage honestly (the row goes `partial`; the SVG/JPEG outputs stay
// committed). Coordinates: SVG user
// units (px at 96 DPI) → PostScript points (0.75), y flipped once up front.

import { identity, multiply, type Matrix } from "./geom/matrix";
import { styleMap } from "./geom/stroke";
import { basePaint, resolvePaint, paintOf, mix, psColor, strokePs, Unsupported, type Rgb, type Paint } from "./epspaint";
import { shapePathPs } from "./epspath";
import { rectRadii } from "./geom/shapes";
import { gradientFill } from "./epsgradientfill";
import { recordPaint, type PaintMark } from "./epsscene";
import { epsTransform, matrixPs } from "./epstransform";
import { assemble, integerBounds, PX_TO_PT, type EpsBoundingBox, type EpsOptions } from "./epsdoc";

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



function writeEpsUnsafe(svgText: string, background: string, opts: EpsOptions): EpsResult {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg") throw new Unsupported("not an SVG document");
  if (root.getAttribute("transform") !== null) throw new Unsupported("a transform on the root <svg> element");
  const vb = viewBoxOf(root);
  if (vb === null) throw new Unsupported("no viewBox on the root <svg>");
  const bg = paintOf(background);
  if (bg === null) throw new Unsupported(`unsupported background paint: ${background}`);
  const ctx: WalkCtx = { ctm: identity(), paint: basePaint(), bg, root, viewport: vb, marks: [], body: [], count: { shapes: 0, roundedRects: 0 } };
  walk(root, ctx);
  // Two boxes, as DSC wants: the integer one a Level-1 reader uses, and the
  // exact one (`%%HiResBoundingBox`) a modern consumer places the art by.
  const ptW = vb[2] * PX_TO_PT;
  const ptH = vb[3] * PX_TO_PT;
  const hires = { llx: 0, lly: 0, urx: ptW, ury: ptH };
  const box = integerBounds(hires);
  const eps = assemble({ viewBox: vb, box, hires, body: ctx.body, opts });
  return { ok: true, eps, boundingBox: box, shapes: ctx.count.shapes, fixes: fixLines(ctx.count) };
}

/** The automatic adjustments, spelled out for the row, the log and the toast. */
function fixLines(count: WalkCtx["count"]): string[] {
  const n = count.roundedRects;
  if (n === 0) return [];
  return [n === 1 ? "1 rounded <rect> written as an exact path outline" : `${n} rounded <rect>s written as exact path outlines`];
}

/** The walk state: CTM + paint cascade in, emitted PS and shape count out. */
interface WalkCtx {
  ctm: Matrix;
  paint: Paint;
  bg: Rgb;
  body: string[];
  root: Element;
  viewport: number[];
  marks: PaintMark[];
  count: { shapes: number; roundedRects: number };
}

function walk(el: Element, ctx: WalkCtx): void {
  const tag = el.nodeName.toLowerCase();
  if (SKIP.includes(tag)) return;
  if (displayNone(el)) return;
  checkSupported(el);
  const next: WalkCtx = { ...ctx, ctm: multiply(ctx.ctm, epsTransform(el.getAttribute("transform"))), paint: resolvePaint(el, ctx.paint) };
  if (SHAPES.includes(tag)) emitShape(el, next, ctx);
  else if (CONTAINERS.includes(tag)) walkChildren(el, next);
  else throw new Unsupported(`<${tag}> is outside the EPS subset`);
}

function walkChildren(el: Element, ctx: WalkCtx): void {
  for (const child of Array.from(el.children)) walk(child, ctx);
}

function displayNone(el: Element): boolean {
  return (styleMap(el.getAttribute("style"))["display"] ?? el.getAttribute("display") ?? "").trim().toLowerCase() === "none";
}

/** The subset checks that fail the stage honestly (never guessed). */
function checkSupported(el: Element): void {
  if (el.nodeName.toLowerCase() === "style") throw new Unsupported("CSS <style> blocks are outside the EPS subset");
  const style = styleMap(el.getAttribute("style"));
  if ((style["color-interpolation"] ?? el.getAttribute("color-interpolation") ?? "sRGB") !== "sRGB") throw new Unsupported("EPS gradients require sRGB color interpolation");
  if ((style["opacity"] ?? el.getAttribute("opacity")) !== null) throw new Unsupported("group opacity is outside the EPS subset");
  for (const effect of ["clip-path", "mask", "filter"]) {
    if ((style[effect] ?? el.getAttribute(effect)) !== null) throw new Unsupported(`\`${effect}\` is outside the EPS subset`);
  }
}

/**
 * One shape: gsave, CTM, path, fill, stroke, grestore. `fill` CONSUMES the
 * current path, so a shape with both paints fills inside its own
 * gsave/grestore and strokes the path that is then still there (I-61). A shape
 * that paints nothing emits nothing — an unpainted path is not an object.
 */
function emitShape(el: Element, ctx: WalkCtx, out: WalkCtx): void {
  const path = shapePathPs(el);
  if (path === null) throw new Unsupported(`<${el.nodeName.toLowerCase()}> uses features outside the EPS subset`);
  const { fill, stroke } = ctx.paint;
  if (fill === null && stroke === null) return;
  const m = matrixPs(ctx.ctm);
  const fillPs = fillProgram(el, ctx);
  const paints = stroke === null ? fillPs : `${fill === null ? "" : ` gsave${fillPs} grestore`}${strokePs(ctx.paint, ctx.bg)}`;
  out.body.push(`gsave\n${m}\n${path}${paints}\ngrestore`);
  recordPaint(el, ctx.ctm, ctx.paint, ctx.marks);
  out.count.shapes++;
  if (isRoundedRect(el)) out.count.roundedRects++;
}

function fillProgram(el: Element, ctx: WalkCtx): string {
  const fill = ctx.paint.fill;
  if (fill === null) return "";
  if ("ref" in fill) return gradientFill(el, fill.ref, ctx.paint.fillOpacity, { ...ctx, evenOdd: ctx.paint.evenOdd });
  return ` ${psColor(mix(fill, ctx.bg, ctx.paint.fillOpacity))} setrgbcolor ${ctx.paint.evenOdd ? "eofill" : "fill"}`;
}

/** A <rect> whose corners the outline model drew as arcs — reported as an automatic fix. */
function isRoundedRect(el: Element): boolean {
  if (el.nodeName.toLowerCase() !== "rect") return false;
  const [rx, ry] = rectRadii(el, Number(el.getAttribute("width")), Number(el.getAttribute("height")));
  return rx > 0 && ry > 0;
}

function viewBoxOf(root: Element): number[] | null {
  const raw = root.getAttribute("viewBox");
  if (raw === null) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n)) || nums[2] <= 0 || nums[3] <= 0) return null;
  return nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0 ? nums : null;
}
