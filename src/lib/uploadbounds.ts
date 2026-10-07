// uploadbounds.ts — the visible bounds of an SVG document (RULE 1/3).
// Owns: walking the document once, accumulating transforms, measuring every
// drawable element through `svggeom`, adding each one's stroke, resolving
// `<use>`, and reporting what it could NOT measure (filters, masks, text,
// embedded rasters) instead of pretending those draw nothing. The result is the
// ink box the artboard is built from — the source document is only read.

import { intersectBox, shapeBox, strokeBox, unionBox, type Box, type StrokeStyle } from "./svggeom";
import { multiply, transformOf, type Matrix } from "./svgtransform";
import { parseSvg } from "./svgvalidate";
import { svgValue } from "./svgstyle";

/** Elements whose box cannot be computed without layout or rasterisation. */
const UNMEASURABLE = ["text", "tspan", "image", "foreignobject", "filter", "mask", "clippath", "pattern"];

export interface BoundsResult {
  /** Ink box in user units, from geometry + strokes (null = nothing drawable). */
  box: Box | null;
  /** The part of `box` the viewport actually shows (null = fully outside). */
  visible: Box | null;
  /** The document's own viewBox. */
  viewBox: Box;
  /** How many elements contributed a box (evidence for the record/UI). */
  measured: number;
  /** Ink leaves the declared viewBox: reported, never silently cropped. */
  clipped: boolean;
  /** Element names that were skipped because they cannot be measured here. */
  unmeasurable: string[];
  /** Elements (or a group) carrying a filter/mask/clip-path declaration. */
  effects: string[];
}

export interface DocumentBounds {
  ok: boolean;
  error: string | null;
  bounds: BoundsResult | null;
}

interface Walk {
  boxes: Box[];
  measured: number;
  unmeasurable: Set<string>;
  effects: Set<string>;
  seen: Set<string>;
}

/** The whole document's visible bounds; a broken document reports why. */
export function documentBounds(code: string): DocumentBounds {
  const { doc, errors } = parseSvg(code);
  if (doc === null) return { ok: false, error: errors[0] ?? "no SVG to measure", bounds: null };
  const viewBox = viewBoxOf(doc.documentElement);
  if (viewBox === null) return { ok: false, error: "no viewBox and no usable width/height", bounds: null };
  const walk: Walk = { boxes: [], measured: 0, unmeasurable: new Set(), effects: new Set(), seen: new Set() };
  visit(doc.documentElement, [1, 0, 0, 1, 0, 0], walk);
  const box = unionBox(walk.boxes);
  return { ok: true, error: null, bounds: boundsOf(box, viewBox, walk) };
}

function boundsOf(box: Box | null, viewBox: Box, walk: Walk): BoundsResult {
  const visible = box === null ? null : intersectBox(viewBox, box);
  return {
    box,
    visible,
    viewBox,
    measured: walk.measured,
    clipped: box !== null && !containsBox(viewBox, box),
    unmeasurable: [...walk.unmeasurable].sort(),
    effects: [...walk.effects].sort(),
  };
}

/**
 * One element: composed transform, then either a measured box or a recursion.
 * `<use>` is followed to the element it names (with its x/y offset), because an
 * icon set that shares one symbol is common and skipping it would under-measure.
 */
function visit(el: Element, parent: Matrix, walk: Walk): void {
  if (!isVisible(el)) return;
  const matrix = multiply(parent, transformOf(el));
  noteEffects(el, walk);
  const tag = el.nodeName.toLowerCase();
  if (tag === "g" || tag === "a" || tag === "svg") return visitChildren(el, matrix, walk);
  if (tag === "use") return visitUse(el, matrix, walk);
  if (UNMEASURABLE.includes(tag)) {
    walk.unmeasurable.add(tag === "foreignobject" ? "foreignObject" : tag);
    return;
  }
  addShape(el, tag, matrix, walk);
}

function visitChildren(el: Element, matrix: Matrix, walk: Walk): void {
  for (const child of Array.from(el.children)) visit(child, matrix, walk);
}

/** A `<use href="#id">`: the target's own box, offset by x/y and transformed. */
function visitUse(el: Element, matrix: Matrix, walk: Walk): void {
  const id = (el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? "").replace(/^#/, "");
  const root = el.ownerDocument.documentElement;
  if (id === "" || walk.seen.has(id)) return;
  const target = findById(root, id);
  if (target === null) {
    walk.unmeasurable.add("use (unresolved reference)");
    return;
  }
  walk.seen.add(id);
  const offset: Matrix = [1, 0, 0, 1, number(el.getAttribute("x")), number(el.getAttribute("y"))];
  visit(target, multiply(matrix, offset), walk);
  walk.seen.delete(id);
}

function addShape(el: Element, tag: string, matrix: Matrix, walk: Walk): void {
  const box = shapeBox(tag, (name) => el.getAttribute(name));
  if (box === null) return;
  const styled = styleValue(el);
  if (styled("fill", "fill") === "none" && !isStroked(styled)) return;
  const ink = isStroked(styled) ? strokeBox(box, strokeOf(styled), matrix) : box;
  walk.boxes.push(transformBoxOf(ink, matrix));
  walk.measured += 1;
}

/** True when the element paints a stroke: `stroke` set and a positive width. */
function isStroked(style: (name: string, css: string) => string): boolean {
  const stroke = style("stroke", "stroke");
  return stroke !== "none" && stroke !== "" && strokeOf(style).width > 0;
}

function strokeOf(style: (name: string, css: string) => string): StrokeStyle {
  return {
    width: cssLength(style("stroke-width", "stroke-width"), 1),
    cap: (style("stroke-linecap", "stroke-linecap") || "butt") as StrokeStyle["cap"],
    join: (style("stroke-linejoin", "stroke-linejoin") || "miter") as StrokeStyle["join"],
    miterLimit: cssLength(style("stroke-miterlimit", "stroke-miterlimit"), 4),
    nonScaling: style("vector-effect", "vector-effect") === "non-scaling-stroke",
  };
}

/** Records a filter/mask/clip-path declaration, which can move the real bounds. */
function noteEffects(el: Element, walk: Walk): void {
  const style = styleValue(el);
  for (const name of ["filter", "mask", "clip-path"]) {
    const value = style(name, name);
    if (value !== "" && value !== "none") walk.effects.add(`${name}="${value}"`);
  }
}

/** The one reader for "which declaration wins" (inline style, then attribute). */
function styleValue(el: Element): (name: string, css: string) => string {
  return (name: string, css: string) => svgValue(el, name, css);
}

/** display/visibility/opacity: an element nobody sees contributes no ink. */
function isVisible(el: Element): boolean {
  const style = styleValue(el);
  return style("display", "display") !== "none"
    && style("visibility", "visibility") !== "hidden"
    && style("opacity", "opacity") !== "0";
}

/** "2" / "2px" / "2pt" -> user units (CSS px at 96 dpi, as the renderer does). */
function cssLength(value: string, fallback: number): number {
  const match = /^\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*(px|pt|mm|in|%)?\s*$/i.exec(value);
  if (match === null) return fallback;
  const n = Number(match[1]);
  const factor = { pt: 96 / 72, mm: 96 / 25.4, in: 96 }[match[2]?.toLowerCase() ?? ""] ?? 1;
  return match[2] === "%" || !Number.isFinite(n) ? fallback : n * factor;
}

function transformBoxOf(box: Box, m: Matrix): Box {
  const corners = [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x, y: box.y + box.h }, { x: box.x + box.w, y: box.y + box.h }]
    .map((p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The document's own box: the viewBox, or its width/height when it has none. */
export function viewBoxOf(root: Element): Box | null {
  const parts = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }
  const w = number(root.getAttribute("width"));
  const h = number(root.getAttribute("height"));
  return w > 0 && h > 0 ? { x: 0, y: 0, w, h } : null;
}

function containsBox(outer: Box, inner: Box): boolean {
  const eps = 1e-6;
  return inner.x >= outer.x - eps && inner.y >= outer.y - eps
    && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.h <= outer.y + outer.h + eps;
}

function findById(root: Element, id: string): Element | null {
  return Array.from(root.getElementsByTagName("*")).find((el) => el.getAttribute("id") === id) ?? null;
}

function number(value: string | null): number {
  const n = Number((value ?? "").replace(/px$/i, ""));
  return Number.isFinite(n) ? n : 0;
}
