// svgtransform.ts — SVG transform lists as one 2×3 matrix (RULE 1/3). Owns:
// parsing `transform="…"`, reading the transform an element actually has (the
// inline style wins over the attribute, via `svgstyle`), composing nested
// matrices and mapping points and boxes through them.
//
// Pure math plus that one shared reader: the bounds walker, the EPS emitter and
// the artboard must never disagree about which transform applies.

import { svgValue } from "./svgstyle";

export type Matrix = [number, number, number, number, number, number]; // a b c d e f
export interface Point { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** The element's own transform: the inline declaration, else the attribute. */
export function transformOf(el: Element): Matrix {
  return parseTransform(svgValue(el, "transform"));
}

/** One transform list, applied left to right; unknown functions are ignored. */
export function parseTransform(text: string | null): Matrix {
  if (text === null || text.trim() === "") return IDENTITY;
  let out: Matrix = IDENTITY;
  for (const match of text.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const args = match[2].trim().split(/[\s,]+/).filter((part) => part !== "").map(Number);
    if (args.some((value) => !Number.isFinite(value))) continue;
    out = multiply(out, fn(match[1], args)); // the list's first function is outermost
  }
  return out;
}

/** One builder per transform function; an unknown name is the identity. */
const BUILDERS: Record<string, (a: number[]) => Matrix> = {
  matrix: (a) => (a.length === 6 ? [a[0], a[1], a[2], a[3], a[4], a[5]] : IDENTITY),
  translate: (a) => [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0],
  scale: (a) => [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0],
  rotate: (a) => rotateBy(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0),
  skewX: (a) => [1, 0, Math.tan(radians(a[0] ?? 0)), 1, 0, 0],
  skewY: (a) => [1, Math.tan(radians(a[0] ?? 0)), 0, 1, 0, 0],
};

function fn(name: string, args: number[]): Matrix {
  const build = BUILDERS[name];
  return build === undefined ? IDENTITY : build(args);
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** A rotation about (cx, cy) is translate · rotate · translate back. */
function rotateBy(degrees: number, cx: number, cy: number): Matrix {
  const rad = radians(degrees);
  const rotation: Matrix = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
  if (cx === 0 && cy === 0) return rotation;
  return multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
}

/** `multiply(m, n)` = m·n: n applies to the point first, then m — m is outer. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** How much the matrix stretches, on average — what a stroke width is scaled by. */
export function scaleOf(m: Matrix): number {
  return (Math.hypot(m[0], m[1]) + Math.hypot(m[2], m[3])) / 2;
}

export function isIdentity(m: Matrix): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

/** The four corners, mapped — the box the caller turns into an axis-aligned one. */
export function mapPoints(m: Matrix, box: Box): Point[] {
  return [
    applyMatrix(m, { x: box.x, y: box.y }),
    applyMatrix(m, { x: box.x + box.w, y: box.y }),
    applyMatrix(m, { x: box.x, y: box.y + box.h }),
    applyMatrix(m, { x: box.x + box.w, y: box.y + box.h }),
  ];
}
