// bakeshape.ts — one shape's own attributes under a matrix (RULE 3,
// 2026-10-08): a rect/ellipse/line/polyline/polygon keeps its element when the
// matrix is axis-aligned, a circle when it is uniform, a path always (its data
// goes through the outline model); otherwise the caller rewrites the shape as a
// path. The matrix predicates live here because they ARE the rule for what a
// shape can absorb without changing the picture.

import { fmt } from "../geom";
import { applyM, scaleOf, type Matrix } from "./matrix";
import { outlineToPathData, pathOutline, transformOutline } from "./outline";
import { transformPoints } from "./seg";

const EPS = 1e-9;

/** Scale + translate only, no flip: the attribute boxes stay boxes. */
export function isAxisAligned(m: Matrix): boolean {
  return Math.abs(m.b) < EPS && Math.abs(m.c) < EPS && m.a > 0 && m.d > 0;
}

/** Rotation + uniform scale (or a reflection of it): a stroke keeps ONE width. */
export function isUniform(m: Matrix): boolean {
  return (Math.abs(m.a - m.d) < EPS && Math.abs(m.b + m.c) < EPS)
    || (Math.abs(m.a + m.d) < EPS && Math.abs(m.b - m.c) < EPS);
}

/** Rewrites the shape's own attributes in place; false = it must become a path. */
export function bakeShapeAttrs(el: Element, m: Matrix): boolean {
  const bake = BAKERS[el.nodeName.toLowerCase()];
  return bake === undefined ? false : bake(el, m);
}

const BAKERS: Record<string, (el: Element, m: Matrix) => boolean> = {
  rect: bakeRect, circle: bakeCircle, ellipse: bakeEllipse, line: bakeLine,
  polyline: bakePoints, polygon: bakePoints, path: bakePath,
};

function bakeRect(el: Element, m: Matrix): boolean {
  if (!isAxisAligned(m)) return false;
  const [x, y] = applyM(m, num(el, "x"), num(el, "y"));
  set(el, { x, y, width: m.a * num(el, "width"), height: m.d * num(el, "height") });
  const rx = el.getAttribute("rx");
  const ry = el.getAttribute("ry");
  if (rx !== null || ry !== null) {
    // SVG: a missing radius copies the other one — under a non-uniform scale both must be explicit.
    const r = Number(rx ?? ry);
    set(el, { rx: m.a * (rx === null ? r : Number(rx)), ry: m.d * (ry === null ? r : Number(ry)) });
  }
  return true;
}

function bakeCircle(el: Element, m: Matrix): boolean {
  if (!isUniform(m)) return false;
  const [cx, cy] = applyM(m, num(el, "cx"), num(el, "cy"));
  set(el, { cx, cy, r: scaleOf(m) * num(el, "r") });
  return true;
}

function bakeEllipse(el: Element, m: Matrix): boolean {
  if (!isAxisAligned(m)) return false;
  const [cx, cy] = applyM(m, num(el, "cx"), num(el, "cy"));
  set(el, { cx, cy, rx: m.a * num(el, "rx"), ry: m.d * num(el, "ry") });
  return true;
}

function bakeLine(el: Element, m: Matrix): boolean {
  const [x1, y1] = applyM(m, num(el, "x1"), num(el, "y1"));
  const [x2, y2] = applyM(m, num(el, "x2"), num(el, "y2"));
  set(el, { x1, y1, x2, y2 });
  return true;
}

function bakePoints(el: Element, m: Matrix): boolean {
  const raw = el.getAttribute("points");
  if (raw === null) return true; // no geometry — nothing to move
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  el.setAttribute("points", transformPoints(nums, m).map(fmt).join(" "));
  return true;
}

function bakePath(el: Element, m: Matrix): boolean {
  const outline = pathOutline(el.getAttribute("d"));
  if (outline !== null) el.setAttribute("d", outlineToPathData(transformOutline(outline, m)));
  return true;
}

function set(el: Element, values: Record<string, number>): void {
  for (const [key, value] of Object.entries(values)) el.setAttribute(key, fmt(value));
}

function num(el: Element, attr: string): number {
  const n = Number(el.getAttribute(attr));
  return Number.isFinite(n) ? n : 0;
}
