// eps.ts — the genuine EPS writer for the "SVG to upload" tab
// (design §2.5): a documented SUBSET of SVG → real PostScript, written as an
// **EPS 10 / Illustrator-compatible** document (2026-10-08): the full DSC
// comment block stock sites and Illustrator expect — `%!PS-Adobe-3.0 EPSF-3.0`,
// `%%BoundingBox` AND `%%HiResBoundingBox`, `%%DocumentData: Clean7Bit`,
// `%%LanguageLevel: 3`, `%%Creator/%%Title/%%CreationDate`, a supplied procset
// and the setup — never a renamed PS/PDF. The conversion consumes the OPTIMIZED,
// cleaned export SVG (the pipeline runs it after prepare → optimize → clean),
// so what Illustrator opens is what the package ships.
//
// 2026-11-19 — the body is written the way a drawing program writes one, not as
// a log of the walker's decisions: the prolog supplies the short operators
// (`m l c h f S w J j M d rg q Q`), the setup sets the document transform and
// the pen defaults ONCE, identity matrices and per-shape `gsave`s are gone, only
// the pen values that actually change are written, and a transform is replayed
// as ONE wrapping `q [matrix] concat … Q` around the group it belongs to.
// `ppstyle.ts`-style state tracking lives at the bottom of this file.
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
import { basePaint, resolvePaint, paintOf, mix, psColor, Unsupported, type Rgb, type Paint } from "./epspaint";
import { shapePathPs } from "./epspath";
import { rectRadii } from "./geom/shapes";
import { gradientFill } from "./epsgradientfill";
import { recordPaint, type PaintMark } from "./epsscene";
import { epsTransform, matrixPs } from "./epstransform";
import { fmt } from "./geom";
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
  const ctx: WalkCtx = {
    ctm: identity(), paint: basePaint(), bg, root, viewport: vb, marks: [],
    out: [], state: writerState(), count: { shapes: 0, roundedRects: 0 },
  };
  walk(root, ctx);
  // Two boxes, as DSC wants: the integer one a Level-1 reader uses, and the
  // exact one (`%%HiResBoundingBox`) a modern consumer places the art by.
  const ptW = vb[2] * PX_TO_PT;
  const ptH = vb[3] * PX_TO_PT;
  const hires = { llx: 0, lly: 0, urx: ptW, ury: ptH };
  const box = integerBounds(hires);
  const eps = assemble({ viewBox: vb, box, hires, body: ctx.out, opts });
  return { ok: true, eps, boundingBox: box, shapes: ctx.count.shapes, fixes: fixLines(ctx.count) };
}

/** The automatic adjustments, spelled out for the row, the log and the toast. */
function fixLines(count: WalkCtx["count"]): string[] {
  const n = count.roundedRects;
  if (n === 0) return [];
  return [n === 1 ? "1 rounded <rect> written as an exact path outline" : `${n} rounded <rect>s written as exact path outlines`];
}

/**
 * The pen as the setup leaves it (`epsdoc.PEN_DEFAULTS`): width 1, no dash,
 * butt caps, miter joins, miter limit 4. The body writes a value only when it
 * differs, which is what a real drawing program's output looks like.
 */
const PEN_START: Pen = { width: 1, dash: "[]", cap: 0, join: 0, miter: 4 };

/** One line of emitted state: a value the pen had before, and what it is now. */
interface Pen { width: number; dash: string; cap: number; join: number; miter: number }

/**
 * What the program has already told the interpreter. One object, shared by every
 * walk step (the context is copied per element, so the state must not be) — this
 * is why a run of same-inked shapes writes `rg` once.
 */
interface WriterState { pen: Pen; colour: string | null }

function writerState(): WriterState {
  return { pen: { ...PEN_START }, colour: null };
}

/** The walk state: CTM + paint cascade + pen in, emitted PS and shape count out. */
interface WalkCtx {
  ctm: Matrix;
  paint: Paint;
  bg: Rgb;
  /** The program lines written so far (a group is one wrapped block). */
  out: string[];
  /** The pen and the colour the program has already set — never repeated. */
  state: WriterState;
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
  const local = epsTransform(el.getAttribute("transform"));
  const paint = resolvePaint(el, ctx.paint);
  if (SHAPES.includes(tag)) {
    emitShape(el, { ...ctx, ctm: multiply(ctx.ctm, local), paint }, local);
    return;
  }
  if (!CONTAINERS.includes(tag)) throw new Unsupported(`<${tag}> is outside the EPS subset`);
  // A group's transform becomes ONE wrapping save/restore around its children —
  // never one per shape, and never an identity matrix.
  const wrapped = isIdentity(local);
  if (wrapped) {
    walkChildren(el, { ...ctx, paint });
    return;
  }
  ctx.out.push(`q\n${matrixPs(local)}`);
  walkChildren(el, { ...ctx, ctm: multiply(ctx.ctm, local), paint });
  ctx.out.push("Q");
}

function walkChildren(el: Element, ctx: WalkCtx): void {
  for (const child of Array.from(el.children)) walk(child, ctx);
}

function isIdentity(m: Matrix): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
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
 * One shape: the path, then the paint(s) it needs, with only the pen values and
 * colours that actually change. PostScript's painting operators leave the
 * current path alone while the checker treats them as consuming it, so a shape
 * that is filled AND stroked states its path for each paint — the form cairo and
 * Illustrator put in their own EPS files, and correct under both readings
 * (I-61). A shape that paints nothing emits nothing: an unpainted path is not an
 * object. A shape with its own transform is wrapped on its own; one without the
 * walker's transform is not wrapped at all.
 */
function emitShape(el: Element, ctx: WalkCtx, local: Matrix): void {
  const path = shapePathPs(el);
  if (path === null) throw new Unsupported(`<${el.nodeName.toLowerCase()}> uses features outside the EPS subset`);
  const { fill, stroke } = ctx.paint;
  if (fill === null && stroke === null) return;
  const wrapped = !isIdentity(local);
  if (wrapped) ctx.out.push(`q\n${matrixPs(local)}`);
  ctx.out.push(painted(ctx, el, path));
  if (wrapped) ctx.out.push("Q");
  recordPaint(el, ctx.ctm, ctx.paint, ctx.marks);
  ctx.count.shapes++;
  if (isRoundedRect(el)) ctx.count.roundedRects++;
}

/** The painting operators for one path: fill, stroke, or both (whatever the paint says). */
function painted(ctx: WalkCtx, el: Element, path: string): string {
  const fill = ctx.paint.fill === null ? "" : fillProgram(el, ctx, path);
  const stroke = ctx.paint.stroke === null ? "" : strokeProgram(ctx, path);
  // A shading program ends its own lines; anything else is one statement.
  return [fill, stroke].filter((part) => part !== "").join(fill.includes("\n") ? "\n" : " ");
}

/**
 * A fill: a solid colour (only if it changed) then the path and `f`/`f*`, or a
 * native vector shading clipped to the same path (`epsgradientfill.ts`).
 */
function fillProgram(el: Element, ctx: WalkCtx, path: string): string {
  const fill = ctx.paint.fill;
  if (fill === null) return "";
  if ("ref" in fill) return `${path} ${gradientFill(el, fill.ref, ctx.paint.fillOpacity, { ...ctx, evenOdd: ctx.paint.evenOdd })}`;
  const colour = colourProgram(ctx, mix(fill, ctx.bg, ctx.paint.fillOpacity));
  return `${colour}${path} ${ctx.paint.evenOdd ? "f*" : "f"}`;
}

/** A stroke: the pen (only the values that differ), the colour (ditto), the path, `S`. */
function strokeProgram(ctx: WalkCtx, path: string): string {
  const colour = colourProgram(ctx, mix(ctx.paint.stroke as Rgb, ctx.bg, ctx.paint.strokeOpacity));
  return `${penProgram(ctx, ctx.paint)}${colour}${path} S`;
}

/** The pen values that differ from the last ones written, in operator order. */
function penProgram(ctx: WalkCtx, paint: Paint): string {
  const wanted: [keyof Pen, string][] = [
    ["width", `${fmt(paint.strokeWidth)} w`],
    ["dash", `${dashArray(paint)} 0 d`],
    ["cap", `${paint.cap} J`],
    ["join", `${paint.join} j`],
    ["miter", `${fmt(paint.miter)} M`],
  ];
  const out: string[] = [];
  for (const [key, line] of wanted) {
    const value = key === "width" ? paint.strokeWidth : key === "dash" ? dashArray(paint) : paint[key];
    if (ctx.state.pen[key] === value) continue;
    (ctx.state.pen[key] as number | string) = value;
    out.push(line);
  }
  return out.length === 0 ? "" : `${out.join(" ")} `;
}

function dashArray(paint: Paint): string {
  return paint.dash === null ? "[]" : `[${paint.dash.map(fmt).join(" ")}]`;
}

/**
 * The colour, only when it is not the one already in force. PostScript keeps ONE
 * colour, so a shape painted in a single ink says `rg` once and names it for both
 * of its paints.
 */
function colourProgram(ctx: WalkCtx, colour: Rgb): string {
  const value = psColor(colour);
  if (ctx.state.colour === value) return "";
  ctx.state.colour = value;
  return `${value} rg `;
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
