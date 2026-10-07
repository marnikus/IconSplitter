// svggeom.ts — shapes, strokes and box algebra, without a browser (RULE 1/3).
// Owns: a box for every basic shape, the stroke allowance that keeps an icon
// from being cropped, and the box maths the bounds walker composes with.
//
// Path data and arcs live in `svgpath.ts`; the matrix lives in `svgtransform.ts`.
// Under-reporting is the one error that would crop an icon, so the stroke
// allowance is an upper bound: half the width, times the cap's diagonal or the
// miter limit, whichever reaches further.

import { mapPoints, type Box, type Matrix, type Point } from "./svgtransform";
import { around, pathBox } from "./svgpath";

export type { Box, Point } from "./svgtransform";
export { arcOf, arcToCubics, pathBox, pathSegments, pointOnArc } from "./svgpath";
export type { Arc, PathCommand } from "./svgpath";

export interface StrokeStyle {
  /** Stroke width in the element's own user units. */
  width: number;
  cap: "butt" | "round" | "square";
  join: "miter" | "round" | "bevel";
  miterLimit: number;
  /** `vector-effect="non-scaling-stroke"`: the matrix must NOT scale the width. */
  nonScaling: boolean;
}

export type AttrGetter = (name: string) => string | null;

/** The box of one basic shape, read from its attributes. */
export function shapeBox(tag: string, attrs: AttrGetter): Box | null {
  const n = (name: string): number => Number(attrs(name) ?? 0) || 0;
  const or = (name: string, fallback: number): number => {
    const raw = attrs(name);
    const value = raw === null || raw.trim() === "" ? fallback : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  if (tag === "rect") return sizeBox(or("x", 0), or("y", 0), n("width"), n("height"));
  if (tag === "circle") return ellipseBox(n("cx"), n("cy"), n("r"), n("r"));
  if (tag === "ellipse") return ellipseBox(n("cx"), n("cy"), n("rx"), n("ry"));
  if (tag === "line") return lineBox(or("x1", 0), or("y1", 0), or("x2", 0), or("y2", 0));
  if (tag === "polyline" || tag === "polygon") return pointsBox(attrs("points") ?? "");
  if (tag === "path") return pathBox(attrs("d") ?? "");
  return null;
}

function sizeBox(x: number, y: number, w: number, h: number): Box | null {
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

function ellipseBox(cx: number, cy: number, rx: number, ry: number): Box | null {
  return rx > 0 && ry > 0 ? { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry } : null;
}

function lineBox(x1: number, y1: number, x2: number, y2: number): Box | null {
  return x1 === x2 && y1 === y2 ? null : around([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
}

function pointsBox(points: string): Box | null {
  const numbers = points.trim().split(/[\s,]+/).map(Number).filter((value) => Number.isFinite(value));
  const list: Point[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) list.push({ x: numbers[i], y: numbers[i + 1] });
  return list.length === 0 ? null : around(list);
}

/** The ink box of a stroked shape: the outline grown by the stroke's reach. */
export function strokeBox(box: Box, style: StrokeStyle, matrix?: Matrix): Box {
  if (!(style.width > 0)) return box;
  const scale = style.nonScaling || matrix === undefined ? 1 : Math.max(scaleOfMatrix(matrix), 1e-6);
  const half = (style.width * scale) / 2;
  const cap = style.cap === "square" ? Math.SQRT2 : 1;
  const miter = style.join === "miter" ? Math.min(Math.max(style.miterLimit, 1), 4) : 1;
  const reach = half * Math.max(cap, miter);
  return { x: box.x - reach, y: box.y - reach, w: box.w + 2 * reach, h: box.h + 2 * reach };
}

function scaleOfMatrix(matrix: Matrix): number {
  return (Math.hypot(matrix[0], matrix[1]) + Math.hypot(matrix[2], matrix[3])) / 2;
}

/** The axis-aligned box around a transformed box's four corners (never shrunk). */
export function transformBox(box: Box, matrix: Matrix): Box {
  return around(mapPoints(matrix, box));
}

export function unionBox(boxes: readonly (Box | null)[]): Box | null {
  let out: Box | null = null;
  for (const box of boxes) {
    if (box === null) continue;
    out = out === null ? box : {
      x: Math.min(out.x, box.x), y: Math.min(out.y, box.y),
      w: Math.max(out.x + out.w, box.x + box.w) - Math.min(out.x, box.x),
      h: Math.max(out.y + out.h, box.y + box.h) - Math.min(out.y, box.y),
    };
  }
  return out;
}

export function intersectBox(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return right > x && bottom > y ? { x, y, w: right - x, h: bottom - y } : null;
}
