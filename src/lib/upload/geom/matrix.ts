// matrix.ts — SVG transform matrices (RULE 3): the CTM math every geometry
// consumer (bounds, EPS conversion) shares. Pure: text in, matrix out.

export interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function identity(): Matrix {
  return { ...IDENTITY };
}

/** `a` applied after `b` (column-vector convention). */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return {
    a: a.a * b.a + a.c * b.b, b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d, d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e, f: a.b * b.e + a.d * b.f + a.f,
  };
}

/** The largest axis scale of the matrix (stroke widths scale with it). */
export function scaleOf(m: Matrix): number {
  return Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
}

/** Applies the matrix to a point. */
export function applyM(m: Matrix, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

/** Parses a transform list; an unparseable one is the identity, never a crash. */
export function parseTransform(raw: string | null): Matrix {
  if (raw === null) return identity();
  let out = identity();
  for (const m of raw.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    out = multiply(out, opMatrix(m[1].toLowerCase(), m[2].split(/[\s,]+/).filter(Boolean).map(Number)));
  }
  return out;
}

function at(n: number[], i: number, fallback: number): number {
  return Number.isFinite(n[i]) ? n[i] : fallback;
}

/** One matrix per transform function — a table, not an if-chain (RULE 19). */
function opMatrix(op: string, n: number[]): Matrix {
  if (op === "matrix" && n.length === 6) return { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] };
  const table: Record<string, () => Matrix> = {
    translate: () => ({ ...IDENTITY, e: at(n, 0, 0), f: at(n, 1, 0) }),
    scale: () => ({ a: at(n, 0, 1), b: 0, c: 0, d: at(n, 1, at(n, 0, 1)), e: 0, f: 0 }),
    rotate: () => rotateMatrix(at(n, 0, 0), at(n, 1, 0), at(n, 2, 0)),
    skewx: () => ({ ...IDENTITY, c: Math.tan((at(n, 0, 0) * Math.PI) / 180) }),
    skewy: () => ({ ...IDENTITY, b: Math.tan((at(n, 0, 0) * Math.PI) / 180) }),
  };
  return table[op]?.() ?? identity();
}

/** rotate(a) about (cx, cy) = translate(cx,cy) · rotate(a) · translate(-cx,-cy). */
function rotateMatrix(deg: number, cx: number, cy: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const rot: Matrix = { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 };
  return multiply(multiply({ ...IDENTITY, e: cx, f: cy }, rot), { ...IDENTITY, e: -cx, f: -cy });
}
