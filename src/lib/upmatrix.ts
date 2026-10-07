// upmatrix.ts — the affine transforms of the export pipeline (prompt §5).
// Owns: the matrix type, the SVG transform-attribute parser (every documented
// form), multiplication in SVG's apply-order, point application and the
// average scale factor a stroke width must be corrected by. Pure — no DOM.

/** SVG matrix(a,b,c,d,e,f): x' = a·x + c·y + e; y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface Pt {
  x: number;
  y: number;
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** M = A × B — applying M is "B first, then A" (SVG transform list order). */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function applyMatrix(m: Matrix, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/**
 * The uniform scale a stroke width inherits from a transform: sqrt(|det|).
 * Zero (a degenerate collapse) is reported honestly, never guessed to 1.
 */
export function avgScale(m: Matrix): number {
  const det = m[0] * m[3] - m[1] * m[2];
  return Math.sqrt(Math.abs(det));
}

const TRANSFORM_RE = /(translate|scale|rotate|skewX|skewY|matrix)\s*\(([^)]*)\)/g;

/** Parses a transform attribute; an unparsable part is the identity, not a guess. */
export function parseTransform(text: string): Matrix {
  let total = IDENTITY;
  for (const m of text.matchAll(TRANSFORM_RE)) {
    const args = (m[2].match(/[-+]?[\d.]+(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    total = multiply(total, singleTransform(m[1], args));
  }
  return total;
}

const TRANSFORM_MAKERS: Record<string, (a: number[]) => Matrix> = {
  translate: (a) => [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0],
  scale: (a) => [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0],
  rotate: (a) => rotateMatrix(a[0] ?? 0, a[1], a[2]),
  skewX: (a) => [1, 0, Math.tan(deg(a[0] ?? 0)), 1, 0, 0],
  skewY: (a) => [1, Math.tan(deg(a[0] ?? 0)), 0, 1, 0, 0],
  matrix: (a) => [a[0] ?? 1, a[1] ?? 0, a[2] ?? 0, a[3] ?? 1, a[4] ?? 0, a[5] ?? 0],
};

/** One transform function; an unknown name contributes the identity, not a guess. */
function singleTransform(name: string, a: number[]): Matrix {
  const make = TRANSFORM_MAKERS[name];
  return make === undefined ? IDENTITY : make(a);
}

function rotateMatrix(angle: number, cx?: number, cy?: number): Matrix {
  const cos = Math.cos(deg(angle));
  const sin = Math.sin(deg(angle));
  if (cx === undefined || cy === undefined) return [cos, sin, -sin, cos, 0, 0];
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

function deg(a: number): number {
  return (a * Math.PI) / 180;
}
