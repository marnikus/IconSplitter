// ops.ts — the outline model's primitives (RULE 3): the absolute
// move/line/cubic/close op, the builders every shape uses, the KAPPA constant
// and the lenient number read. `outline.ts` is the model's front door; this
// file exists so the shape builders and the path grammar share one vocabulary
// without a cycle.

export type OutlineOp =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

export interface Outline { ops: OutlineOp[] }

/** The circle-approximation constant: a quarter arc as one cubic. */
export const KAPPA = 0.5522847498;

export const mv = (x: number, y: number): OutlineOp => ({ op: "M", x, y });
export const ln = (x: number, y: number): OutlineOp => ({ op: "L", x, y });
export const cv = (c1: number[], c2: number[], end: number[]): OutlineOp =>
  ({ op: "C", x1: c1[0], y1: c1[1], x2: c2[0], y2: c2[1], x: end[0], y: end[1] });

/** A numeric attribute; anything unreadable is 0 (a missing x/y IS 0 in SVG). */
export function num(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
