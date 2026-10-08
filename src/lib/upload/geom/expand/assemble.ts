// assemble.ts — the stroke expander's front door (2026-10-09, design D4
// steps 1, 6): an Outline split into subpaths, each subpath (or each dash
// piece of it) offset on both sides and assembled into fill loops. Open →
// left side forward, end cap, right side backwards, start cap, Z. Closed →
// the left loop and the right loop reversed (the ring, two subpaths of ONE
// path). The right side IS the left side of the reversed subpath, so one
// side-walker serves both. Pure: Outline in, Outline out (RULE 3).

import { mv, type Outline, type OutlineOp } from "../ops";
import { dashPieces, type DashSpec } from "./dash";
import { capOps, dotOps, joinOps, type Corner } from "./joins";
import { offsetSeg } from "./offset";
import {
  endTangent, isDegenerate, mul, reverseSeg, same, segEnd, segStart, startTangent,
  type Pen, type Pt, type Seg, type Subpath,
} from "./pen";

export type { Pen } from "./pen";

/** The outline's subpaths: split at every M, `Z` marks closed. */
export function subpathsOf(o: Outline): Subpath[] {
  const subs: Subpath[] = [];
  let cur: Subpath | null = null;
  let at: Pt = [0, 0];
  for (const op of o.ops) {
    if (op.op === "M") { cur = { segs: [], closed: false, start: [op.x, op.y] }; subs.push(cur); at = [op.x, op.y]; continue; }
    if (cur === null) continue;
    if (op.op === "Z") { if (!same(at, cur.start)) cur.segs.push({ kind: "L", a: at, b: cur.start }); cur.closed = true; at = cur.start; continue; }
    if (op.op === "C") cur.segs.push({ kind: "C", p0: at, p1: [op.x1, op.y1], p2: [op.x2, op.y2], p3: [op.x, op.y] });
    else cur.segs.push({ kind: "L", a: at, b: [op.x, op.y] });
    at = [op.x, op.y];
  }
  return subs;
}

/** The stroke of `o` under `pen` (and dash spec) as a fill outline. */
export function expandOutline(o: Outline, pen: Pen, dash: DashSpec | null = null): Outline {
  const ops: OutlineOp[] = [];
  for (const sub of subpathsOf(o)) {
    const pieces = dash?.pattern ? dashPieces(sub, dash.pattern, dash.offset) : [sub];
    for (const piece of pieces) ops.push(...expandSubpath(piece, pen));
  }
  return { ops };
}

function expandSubpath(sub: Subpath, pen: Pen): OutlineOp[] {
  const d = pen.width / 2;
  if (d <= 0) return [];
  const segs = sub.segs.filter((s) => !isDegenerate(s));
  if (segs.length === 0) return withMove(dotOps(pen, d, sub.start));
  if (sub.closed) return [...withMove(sideOps(segs, d, pen, true)), { op: "Z" }, ...withMove(sideOps(reversed(segs), d, pen, true)), { op: "Z" }];
  return openLoop(segs, d, pen);
}

/** An open subpath as one loop; the caps bridge the sides, Z closes on the first point. */
function openLoop(segs: Seg[], d: number, pen: Pen): OutlineOp[] {
  const back = reversed(segs);
  const left = sideOps(segs, d, pen, false);
  const right = sideOps(back, d, pen, false);
  const last = segs[segs.length - 1];
  const endCap = capOps(pen, d, { p: segEnd(last), t: endTangent(last), from: endOf(left), to: startOf(right) });
  const first = segs[0];
  const startCap = capOps(pen, d, { p: segStart(first), t: mul(startTangent(first), -1), from: endOf(right), to: startOf(left) });
  const closing = startCap.length > 0 && isLine(startCap[startCap.length - 1]) ? startCap.slice(0, -1) : startCap; // Z draws the last line
  return [...withMove(left), ...endCap, ...right.slice(1), ...closing, { op: "Z" }];
}

/**
 * The left offset of consecutive segments with their joins, starting with an
 * L at the first offset point. A closed loop opens at its seam and the join
 * from the last segment back to the first closes it.
 */
function sideOps(segs: Seg[], d: number, pen: Pen, closed: boolean): OutlineOp[] {
  const ops: OutlineOp[] = [];
  const offsets = segs.map((seg) => offsetSeg(seg, d));
  for (let i = 0; i < segs.length; i += 1) {
    const start = segStart(offsets[i][0]);
    if (i === 0) ops.push({ op: "L", x: start[0], y: start[1] });
    else ops.push(...joinOps(pen, d, cornerAt(segs, i, lastPoint(ops), start)));
    for (const p of offsets[i]) ops.push(segOp(p));
  }
  if (closed) ops.push(...joinOps(pen, d, cornerAt(segs, 0, lastPoint(ops), segStart(offsets[0][0]))));
  return ops;
}

/** The corner where segment i begins: its vertex, the tangents around it, and the two offset points to bridge. */
function cornerAt(segs: Seg[], i: number, from: Pt, to: Pt): Corner {
  const prev = segs[(i + segs.length - 1) % segs.length];
  return { v: segStart(segs[i]), tIn: endTangent(prev), tOut: startTangent(segs[i]), from, to };
}

const segOp = (p: Seg): OutlineOp => (p.kind === "L"
  ? { op: "L", x: p.b[0], y: p.b[1] }
  : { op: "C", x1: p.p1[0], y1: p.p1[1], x2: p.p2[0], y2: p.p2[1], x: p.p3[0], y: p.p3[1] });

const reversed = (segs: Seg[]): Seg[] => segs.map(reverseSeg).reverse();
const isLine = (op: OutlineOp): boolean => op.op === "L";

/** The ops with their first L turned into the subpath's M. */
function withMove(ops: OutlineOp[]): OutlineOp[] {
  if (ops.length === 0) return [];
  const head = ops[0];
  return head.op === "L" ? [mv(head.x, head.y), ...ops.slice(1)] : ops;
}

function lastPoint(ops: OutlineOp[]): Pt {
  for (let i = ops.length - 1; i >= 0; i -= 1) {
    const op = ops[i];
    if (op.op !== "Z") return [op.x, op.y];
  }
  return [0, 0];
}

const startOf = (ops: OutlineOp[]): Pt => { const op = ops[0]; return op.op === "Z" ? [0, 0] : [op.x, op.y]; };
const endOf = (ops: OutlineOp[]): Pt => lastPoint(ops);
