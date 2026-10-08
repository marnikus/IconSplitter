// bake.ts — every transform resolved into the geometry (RULE 3, 2026-10-08):
// the artwork's own `transform`s and the artboard's translate+scale become
// the shapes' coordinates, so the shipped file has NO transform and prepare
// can write a stroke width verbatim AFTER the maths is done — the stock
// reviewer's `stroke-width="2.6224000000000003"` was a width finalised BEFORE
// the optimizer baked the transforms and re-multiplied it. Stroke widths and
// dash lengths follow their geometry here (× the baked scale); containers lose
// their `stroke-width` because every shape now carries its own. What a bake
// would distort is refused by name BEFORE the tree is touched (RULE 15).

import { isShape, strokeHits, type StrokeHit } from "./geom/bounds";
import { bakeShapeAttrs, isAxisAligned, isUniform } from "./geom/bakeshape";
import { fmt } from "./geom";
import { multiply, scaleOf, type Matrix } from "./geom/matrix";
import { outlineToPathData, shapeOutline, transformOutline } from "./geom/outline";

export interface BakeResult {
  /** Shapes whose coordinates now live in artboard px. */
  baked: number;
  /** Named reasons the bake refused; non-empty = the tree is untouched. */
  unsupported: string[];
}

const SVG_NS = "http://www.w3.org/2000/svg";
/** Attributes that ARE the geometry — they do not travel onto the replacing path. */
const GEOMETRY_ATTRS = ["x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "x1", "y1", "x2", "y2", "points", "d", "transform"];
/** Constructs whose own coordinates would need baking too — refused, not guessed. */
const COORDINATE_DEFS = ["clipPath", "mask", "filter", "pattern"];

/** Bakes `artboard × CTM` into every shape under `root`; refuses (untouched) with reasons. */
export function bakeGeometry(root: Element, artboard: Matrix): BakeResult {
  const hits = strokeHits(root);
  const unsupported = [...bakeVetoes(root), ...shapeVetoes(hits, artboard)];
  if (unsupported.length > 0) return { baked: 0, unsupported };
  let baked = 0;
  for (const hit of hits) {
    if (isShape(hit.el)) {
      bakeShape(hit, multiply(artboard, hit.ctm));
      baked++;
    } else {
      hit.el.removeAttribute("transform");
      hit.el.removeAttribute("stroke-width");
    }
  }
  return { baked, unsupported: [] };
}

/** Definitions with user-space coordinates of their own (D6). */
function bakeVetoes(root: Element): string[] {
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const tag = el.nodeName;
    if (COORDINATE_DEFS.includes(tag)) out.push(`a <${tag}>`);
    else if (/Gradient$/.test(tag) && el.getAttribute("gradientUnits") === "userSpaceOnUse") out.push(`a userSpaceOnUse <${tag}>`);
  }
  return [...new Set(out)];
}

/** A stroke under a non-uniform matrix is anisotropic; a rounded rect cannot turn. */
function shapeVetoes(hits: StrokeHit[], artboard: Matrix): string[] {
  const out: string[] = [];
  for (const hit of hits) {
    if (!isShape(hit.el)) continue;
    const m = multiply(artboard, hit.ctm);
    const tag = hit.el.nodeName.toLowerCase();
    if (!hit.stroke.none && !isUniform(m)) out.push(`a stroked <${tag}> under a non-uniform transform`);
    if (tag === "rect" && isRounded(hit.el) && !isAxisAligned(m)) out.push("a rounded <rect> under a rotation or skew");
  }
  return [...new Set(out)];
}

function isRounded(el: Element): boolean {
  return el.getAttribute("rx") !== null || el.getAttribute("ry") !== null;
}

/** One shape: coordinates, then the lengths that scale with them. */
function bakeShape(hit: StrokeHit, m: Matrix): void {
  const el = bakeShapeAttrs(hit.el, m) ? hit.el : asPath(hit.el, m);
  el.removeAttribute("transform");
  const k = scaleOf(m);
  scaleLengths(el, "stroke-dasharray", k);
  scaleLengths(el, "stroke-dashoffset", k);
  if (hit.stroke.none) return;
  const nonScaling = el.getAttribute("vector-effect") === "non-scaling-stroke";
  el.removeAttribute("vector-effect");
  el.setAttribute("stroke-width", fmt(nonScaling ? hit.stroke.width : hit.stroke.width * k));
}

/** The shape as a `<path>` with its presentation attributes; the element is swapped in place. */
function asPath(el: Element, m: Matrix): Element {
  const outline = shapeOutline(el);
  if (outline === null) return el; // no geometry to move — the element stays as it is
  const path = el.ownerDocument.createElementNS(SVG_NS, "path");
  for (const attr of Array.from(el.attributes)) {
    if (!GEOMETRY_ATTRS.includes(attr.name)) path.setAttribute(attr.name, attr.value);
  }
  path.setAttribute("d", outlineToPathData(transformOutline(outline, m)));
  el.replaceWith(path);
  return path;
}

/** A length list (dash array/offset) multiplied by the baked scale; `none` and junk stay. */
function scaleLengths(el: Element, attr: string, k: number): void {
  const raw = el.getAttribute(attr);
  if (raw === null || !/^[\s\d.,eE+-]+$/.test(raw)) return;
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return;
  el.setAttribute(attr, nums.map((n) => fmt(n * k)).join(" "));
}
