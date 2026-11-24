// eps.ts — the genuine EPS writer for the "SVG to upload" tab
// (design §2.5): a documented SUBSET of SVG → real PostScript, written as an
// plain **EPS 10** document (2026-10-08): the DSC comment block stock sites
// expect — `%!PS-Adobe-3.0 EPSF-3.0`, `%%BoundingBox` AND `%%HiResBoundingBox`,
// `%%DocumentData: Clean7Bit`, `%%LanguageLevel: 3`, the Prolog/Setup sections
// — never a renamed PS/PDF, never a `%%Title`/`%%Creator` or `%AI…` claim (RULE 26). The conversion consumes the OPTIMIZED,
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
import { basePaint, resolvePaint, resolvePathPaintFast, paintOf, mix, psColor, strokePs, Unsupported, type Rgb, type Paint } from "./epspaint";
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
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    return writeEpsUnsafe(doc.documentElement, svgText, background, opts);
  } catch (error) {
    if (error instanceof Unsupported) return { ok: false, reason: error.message };
    throw error;
  }
}

/** Same EPS 10 writer over an already-parsed `<svg>` root (zero redundant `DOMParser` pass). */
export function writeEpsFromRoot(root: Element | null, svgText: string, background: string, opts: EpsOptions = {}): EpsResult {
  try {
    return writeEpsUnsafe(root, svgText, background, opts);
  } catch (error) {
    if (error instanceof Unsupported) return { ok: false, reason: error.message };
    throw error;
  }
}

function writeEpsUnsafe(root: Element | null, svgText: string, background: string, opts: EpsOptions): EpsResult {
  if (root === null || root.nodeName.toLowerCase() !== "svg") throw new Unsupported("not an SVG document");
  if (root.getAttribute("transform") !== null) throw new Unsupported("a transform on the root <svg> element");
  const vb = viewBoxOf(root);
  if (vb === null) throw new Unsupported("no viewBox on the root <svg>");
  const bg = paintOf(background);
  if (bg === null) throw new Unsupported(`unsupported background paint: ${background}`);
  const trackMarks = /<(?:linear|radial)Gradient\b/i.test(svgText);
  const ctx: WalkCtx = { ctm: identity(), paint: basePaint(), bg, root, viewport: vb, marks: [], trackMarks, body: [], count: { shapes: 0, roundedRects: 0 } };
  walk(root, ctx);
  // Two boxes, as DSC wants: the integer one a Level-1 reader uses, and the
  // exact one (`%%HiResBoundingBox`) a modern consumer places the art by.
  const unit = unitOf(root, vb);
  const ptW = vb[2] * unit * PX_TO_PT;
  const ptH = vb[3] * unit * PX_TO_PT;
  const hires = { llx: 0, lly: 0, urx: ptW, ury: ptH };
  const box = integerBounds(hires);
  const eps = assemble({ viewBox: vb, unit, box, hires, body: ctx.body, opts });
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
  trackMarks: boolean;
  count: { shapes: number; roundedRects: number };
}

function walk(el: Element, ctx: WalkCtx): void {
  const tag = el.nodeName.toLowerCase();
  if (tag === "path") {
    const fastPaint = resolvePathPaintFast(el, ctx.paint);
    if (fastPaint !== null) {
      emitShape(el, fastPaint === ctx.paint ? ctx : { ...ctx, paint: fastPaint }, ctx);
      return;
    }
  }
  if (SKIP.includes(tag)) return;
  const style = styleMap(el.getAttribute("style"));
  if (displayNone(el, style)) return;
  checkSupported(el, tag, style);
  const tf = el.getAttribute("transform");
  const ctm = tf === null ? ctx.ctm : multiply(ctx.ctm, epsTransform(tf));
  const next: WalkCtx = { ...ctx, ctm, paint: resolvePaint(el, ctx.paint) };
  if (SHAPES.includes(tag)) emitShape(el, next, ctx);
  else if (CONTAINERS.includes(tag)) walkChildren(el, next);
  else throw new Unsupported(`<${tag}> is outside the EPS subset`);
}

function walkChildren(el: Element, ctx: WalkCtx): void {
  for (let child = el.firstElementChild; child !== null; child = child.nextElementSibling) walk(child, ctx);
}

function displayNone(el: Element, style: Record<string, string>): boolean {
  return (style["display"] ?? el.getAttribute("display") ?? "").trim().toLowerCase() === "none";
}

/** The subset checks that fail the stage honestly (never guessed). */
function checkSupported(el: Element, tag: string, style: Record<string, string>): void {
  if (tag === "style") throw new Unsupported("CSS <style> blocks are outside the EPS subset");
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
  if (ctx.trackMarks) recordPaint(el, ctx.ctm, ctx.paint, ctx.marks);
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

const pxOf = (raw: string | null): number | null => {
  const m = raw === null ? null : /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/i.exec(raw);
  return m === null ? null : Number(m[1]);
};

/**
 * Root px per viewBox unit (2026-11-23): the page is the document's OWN px size
 * — "rescale the artboard to MP" moves width/height and keeps the viewBox, and
 * the EPS has to grow with it like the SVG does. 1 when there is no plain px
 * size, or its ratio is not the viewBox's (then the viewBox decides, as before).
 */
function unitOf(root: Element, vb: number[]): number {
  const w = pxOf(root.getAttribute("width")), h = pxOf(root.getAttribute("height"));
  if (w === null || h === null || w <= 0 || h <= 0) return 1;
  const sx = w / vb[2], sy = h / vb[3];
  return Math.abs(sx - sy) <= 0.005 * Math.max(sx, sy) ? sx : 1;
}

function viewBoxOf(root: Element): number[] | null {
  const raw = root.getAttribute("viewBox");
  if (raw === null) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n)) || nums[2] <= 0 || nums[3] <= 0) return null;
  return nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0 ? nums : null;
}
