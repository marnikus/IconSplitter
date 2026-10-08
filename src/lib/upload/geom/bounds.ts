// bounds.ts — the VISIBLE bounds of an SVG document, strokes included
// (RULE 1/3: geometry math lives in lib, pure in, pure out).
//
// Why analytic and not getBBox(): a parsed (never rendered) document has no
// layout, so the bounds are computed from the geometry itself (lib/upload/geom/path for
// path data, lib/upload/geom/matrix for transforms). Per shape: the geometry hull plus
// a per-join/per-cap stroke extension — a miter join reaches
// (sw/2)/cos(α/2) past the vertex (α = the turn angle between the incoming
// and outgoing travel directions), capped by the miter limit (beyond it the
// join bevels to sw/2); round/bevel joins and butt/round caps reach sw/2;
// square caps reach sw/2·√2. The local hull is transformed by the
// accumulated CTM, then grown by the extension scaled by the CTM's largest
// axis scale (conservative under non-uniform transforms).
// `vector-effect="non-scaling-stroke"` is treated as a normal stroke
// (conservative when the artwork is scaled down). Elements whose bounds no
// geometry can answer for (text, image, use…) are named `unsupported`, never
// guessed.

import { identity, multiply, parseTransform, scaleOf, type Matrix } from "./matrix";
import { pathGeometry, type ShapeGeom, type Subpath } from "./path";
import { lineSeg, type Seg } from "./seg";
import { baseStroke, inheritStroke, type Stroke } from "./stroke";

export type { Stroke } from "./stroke";

export interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface BoundsResult {
  bounds: Bounds;
  /** Element names whose bounds are not computable (text, image, use…). */
  unsupported: string[];
}

/** One element with its accumulated CTM and inherited stroke state. */
export interface StrokeHit {
  el: Element;
  ctm: Matrix;
  stroke: Stroke;
}

interface Acc {
  bounds: Bounds | null;
  unsupported: string[];
}

const SHAPES = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"];
const CONTAINERS = ["svg", "g", "a", "switch"];

/** True for elements that paint geometry (and so can paint a stroke). */
export function isShape(el: Element): boolean {
  return SHAPES.includes(name(el));
}
const UNSUPPORTED = ["text", "tspan", "textpath", "image", "use", "foreignobject"];
/** CSS properties a `<style>` block could use to move or restyle geometry. */
const RISKY_CSS = ["stroke", "transform", "display", "clip", "mask"];

/** Visible bounds of the document under `root`; null when it has no geometry. */
export function visibleBounds(root: Element): BoundsResult | null {
  const acc: Acc = { bounds: null, unsupported: [] };
  walkTree(root, identity(), baseStroke(), (el, ctm, stroke) => {
    const bad = unsupportedTag(el);
    if (bad !== null) {
      acc.unsupported.push(bad);
      return;
    }
    const b = SHAPES.includes(name(el)) ? shapeBounds(el, stroke, ctm) : null;
    if (b !== null) acc.bounds = acc.bounds === null ? b : union(acc.bounds, b);
  });
  if (acc.bounds === null) return null;
  return { bounds: acc.bounds, unsupported: [...new Set(acc.unsupported)] };
}

/** Every element with its accumulated CTM and inherited stroke state. */
export function strokeHits(root: Element): StrokeHit[] {
  const hits: StrokeHit[] = [];
  walkTree(root, identity(), baseStroke(), (el, ctm, stroke) => {
    hits.push({ el, ctm, stroke });
  });
  return hits;
}

type Visit = (el: Element, ctm: Matrix, stroke: Stroke) => void;

function walkTree(el: Element, ctm: Matrix, parent: Stroke, visit: Visit): void {
  const here = inheritStroke(el, parent);
  const local = multiply(ctm, parseTransform(el.getAttribute("transform")));
  visit(el, local, here);
  if (CONTAINERS.includes(name(el))) {
    for (const child of Array.from(el.children)) walkTree(child, local, here, visit);
  }
}

/** The element's name when its bounds cannot be computed honestly. */
function unsupportedTag(el: Element): string | null {
  const tag = name(el);
  if (UNSUPPORTED.includes(tag)) return tag;
  const css = tag === "style" ? (el.textContent ?? "").toLowerCase() : "";
  return RISKY_CSS.some((prop) => css.includes(prop)) ? "style" : null;
}

/** Device-space bounds: CTM hull of the geometry, grown by the stroke extension. */
function shapeBounds(el: Element, stroke: Stroke, ctm: Matrix): Bounds | null {
  const g = shapeGeometry(el);
  if (g === null) return null;
  const device = hullOf(g.hull, ctm);
  const extra = strokeExtraOf(g, stroke) * scaleOf(ctm);
  return grow(device, extra);
}

/** The stroke extension in local units: the largest cap/join reach. */
function strokeExtraOf(g: ShapeGeom, stroke: Stroke): number {
  if (stroke.none || stroke.width <= 0) return 0;
  if (g.smooth) return stroke.width / 2;
  let extra = 0;
  for (const sub of g.subs) extra = Math.max(extra, subpathExtra(sub, stroke));
  return extra;
}

function subpathExtra(sub: Subpath, stroke: Stroke): number {
  const half = stroke.width / 2;
  let extra = 0;
  for (let i = 0; i + 1 < sub.segs.length; i++) {
    extra = Math.max(extra, joinExtra(sub.segs[i], sub.segs[i + 1], half, stroke));
  }
  const closing = sub.closed && sub.segs.length > 1;
  if (closing) extra = Math.max(extra, joinExtra(sub.segs[sub.segs.length - 1], sub.segs[0], half, stroke));
  if (!sub.closed && sub.segs.length > 0) extra = Math.max(extra, capExtra(stroke, half));
  return extra;
}

/** Miter join reach: (sw/2)/cos(α/2), beveled to sw/2 past the miter limit. */
function joinExtra(a: Seg, b: Seg, half: number, stroke: Stroke): number {
  if (stroke.join !== "miter") return half;
  const cosA = clampDot(a.bx, a.by, b.ax, b.ay);
  const denom = Math.cos(Math.acos(cosA) / 2);
  if (denom < 1 / stroke.miter) return half; // past the miter limit: beveled
  return half / Math.max(denom, 1e-6);
}

function capExtra(stroke: Stroke, half: number): number {
  return stroke.cap === "square" ? half * Math.SQRT2 : half;
}

function clampDot(ax: number, ay: number, bx: number, by: number): number {
  const la = Math.hypot(ax, ay) || 1;
  const lb = Math.hypot(bx, by) || 1;
  return Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)));
}

// --- shape geometry ---------------------------------------------------------

/** Geometry hull + subpaths for one shape element; null when it has none. */
function shapeGeometry(el: Element): ShapeGeom | null {
  switch (name(el)) {
    case "rect": return rectGeom(el);
    case "circle": return circleGeom(el, num(el.getAttribute("r")));
    case "ellipse": return circleGeom(el, num(el.getAttribute("rx")), num(el.getAttribute("ry")));
    case "line": return lineGeom(el);
    case "polyline":
    case "polygon": return pointsGeom(el.getAttribute("points"), name(el) === "polygon");
    case "path": return pathGeometry(el.getAttribute("d"));
    default: return null;
  }
}

function rectGeom(el: Element): ShapeGeom | null {
  const w = num(el.getAttribute("width"));
  const h = num(el.getAttribute("height"));
  if (!(w > 0) || !(h > 0)) return null;
  const x = num(el.getAttribute("x"));
  const y = num(el.getAttribute("y"));
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return { hull: pts.flat(), subs: [{ segs: ringSegs(pts), closed: true }], smooth: false };
}

/** Circle/ellipse: a smooth closed curve — hull only, no joins or caps. */
function circleGeom(el: Element, rx: number, ry = rx): ShapeGeom | null {
  if (!(rx > 0) || !(ry > 0)) return null;
  const cx = num(el.getAttribute("cx"));
  const cy = num(el.getAttribute("cy"));
  return { hull: [cx - rx, cy - ry, cx + rx, cy + ry], subs: [], smooth: true };
}

function lineGeom(el: Element): ShapeGeom {
  const pts = [[num(el.getAttribute("x1")), num(el.getAttribute("y1"))], [num(el.getAttribute("x2")), num(el.getAttribute("y2"))]];
  return { hull: pts.flat(), subs: [{ segs: openSegs(pts), closed: false }], smooth: false };
}

function pointsGeom(raw: string | null, closed: boolean): ShapeGeom | null {
  if (raw === null) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 4 || nums.length % 2 !== 0) return null;
  const segs = closed ? ringSegs(pairsOf(nums)) : openSegs(pairsOf(nums));
  return { hull: nums, subs: [{ segs, closed }], smooth: false };
}

/** Straight segments around a point ring (closed) or chain (open). */
function ringSegs(pts: number[][]): Seg[] {
  return pts.map((_, i) => lineSeg(pts[i], pts[(i + 1) % pts.length]));
}

function openSegs(pts: number[][]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push(lineSeg(pts[i], pts[i + 1]));
  return out;
}

// --- bounds plumbing --------------------------------------------------------

function union(a: Bounds, b: Bounds): Bounds {
  const minX = Math.min(a.minX, b.minX);
  const minY = Math.min(a.minY, b.minY);
  return {
    minX, minY,
    width: Math.max(a.minX + a.width, b.minX + b.width) - minX,
    height: Math.max(a.minY + a.height, b.minY + b.height) - minY,
  };
}

function grow(b: Bounds, by: number): Bounds {
  return { minX: b.minX - by, minY: b.minY - by, width: b.width + 2 * by, height: b.height + 2 * by };
}

/** The axis-aligned hull of flat x,y points under the CTM. */
function hullOf(points: number[], m: Matrix): Bounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    xs.push(m.a * points[i] + m.c * points[i + 1] + m.e);
    ys.push(m.b * points[i] + m.d * points[i + 1] + m.f);
  }
  return boxOf(xs, ys);
}

function boxOf(xs: number[], ys: number[]): Bounds {
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

function pairsOf(nums: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

function num(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function name(el: Element): string {
  return el.nodeName.toLowerCase();
}
