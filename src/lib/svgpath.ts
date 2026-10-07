// svgpath.ts — SVG path data as geometry (RULE 1/3): the full path grammar
// (M/L/H/V/C/S/Q/T/A/Z, absolute and relative) compiled into subpaths of
// segments with end tangents. Bounds use the control-point hull (an affine
// map preserves it); arcs contribute their true cardinal extrema. The stroke
// rules (joins/caps) read the tangents — see lib/svgbounds.

import { arcSeg } from "./svgarc";
import { lineSeg, type Seg } from "./svgseg";

export type { Seg } from "./svgseg";
export { lineSeg, transformPoints } from "./svgseg";

export interface Subpath {
  segs: Seg[];
  closed: boolean;
}

export interface ShapeGeom {
  hull: number[];
  subs: Subpath[];
  /** Closed and tangent-continuous (circle/ellipse): no joins, no caps. */
  smooth: boolean;
}

/** Path data → hull + subpaths; null when the path has no geometry. */
export function pathGeometry(d: string | null): ShapeGeom | null {
  if (d === null || d.trim() === "") return null;
  const cur = newCursor();
  for (const step of tokenizePath(d)) dispatchCmd(step, cur);
  const hull = cur.subs.flatMap((s) => s.segs.flatMap((seg) => seg.hull));
  return hull.length === 0 ? null : { hull, subs: cur.subs.filter((s) => s.segs.length > 0), smooth: false };
}

export interface PathCmd { cmd: string; nums: number[] }

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Splits path data into (command, numbers) items; case is preserved (relative
 *  commands stay relative) and implicit repeats after M become line-tos. */
export function tokenizePath(d: string): PathCmd[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? [];
  const out: Tokenizer = { steps: [], cmd: "", nums: [] };
  for (const t of tokens) {
    if (/[a-zA-Z]/.test(t)) takeLetter(t, out);
    else takeNumber(t, out);
  }
  flush(out);
  return out.steps;
}

interface Tokenizer { steps: PathCmd[]; cmd: string; nums: number[] }

function takeLetter(t: string, out: Tokenizer): void {
  if (out.cmd !== "" && out.nums.length > 0) out.steps.push({ cmd: out.cmd, nums: out.nums });
  out.cmd = t;
  out.nums = [];
  if (out.cmd.toUpperCase() === "Z") out.steps.push({ cmd: out.cmd, nums: [] });
}

function takeNumber(t: string, out: Tokenizer): void {
  out.nums.push(Number(t));
  if (out.nums.length === (ARITY[out.cmd.toUpperCase()] ?? 0) && out.cmd !== "") {
    out.steps.push({ cmd: out.cmd, nums: out.nums });
    if (out.cmd === "M" || out.cmd === "m") out.cmd = out.cmd === "M" ? "L" : "l"; // SVG 1.1 §8.3.2
    out.nums = [];
  }
}

function flush(out: Tokenizer): void {
  if (out.cmd !== "" && out.cmd.toUpperCase() !== "Z" && out.nums.length > 0) {
    out.steps.push({ cmd: out.cmd, nums: out.nums });
  }
}

interface Cursor {
  x: number; y: number; sx: number; sy: number;
  subs: Subpath[];
  c2x: number; c2y: number; qx: number; qy: number;
  hasC: boolean; hasQ: boolean;
}

function newCursor(): Cursor {
  return { x: 0, y: 0, sx: 0, sy: 0, subs: [], c2x: 0, c2y: 0, qx: 0, qy: 0, hasC: false, hasQ: false };
}

function dispatchCmd(cmd: PathCmd, cur: Cursor): void {
  const c = cmd.cmd.toUpperCase();
  if (c === "M") return moveTo(cmd, cur);
  if (c === "L") return lineTo(cmd, cur);
  if (c === "T") return smoothQuadTo(cmd, cur);
  dispatchRest(cmd, cur);
}

/** Absolute/relative coordinate pair `i` of the command (x = nums[2i]). */
function pairAt(cmd: PathCmd, cur: Cursor, i: number): [number, number] {
  const rel = cmd.cmd === cmd.cmd.toLowerCase();
  return rel
    ? [cur.x + cmd.nums[2 * i], cur.y + cmd.nums[2 * i + 1]]
    : [cmd.nums[2 * i], cmd.nums[2 * i + 1]];
}

function moveTo(cmd: PathCmd, cur: Cursor): void {
  const [x, y] = pairAt(cmd, cur, 0);
  cur.x = x; cur.y = y; cur.sx = x; cur.sy = y;
  cur.subs.push({ segs: [], closed: false });
  cur.hasC = false; cur.hasQ = false;
}

function lineTo(cmd: PathCmd, cur: Cursor): void {
  const [x, y] = pairAt(cmd, cur, 0);
  pushSeg(cur, lineSeg([cur.x, cur.y], [x, y]));
  cur.hasC = false; cur.hasQ = false;
}

/** T: the control point is the reflection of the previous quad control. */
function smoothQuadTo(cmd: PathCmd, cur: Cursor): void {
  const cx = cur.hasQ ? 2 * cur.x - cur.qx : cur.x;
  const cy = cur.hasQ ? 2 * cur.y - cur.qy : cur.y;
  const [x, y] = pairAt(cmd, cur, 0);
  pushSeg(cur, curveSeg(cur, { x, y, ax: cx - cur.x, ay: cy - cur.y, bx: x - cx, by: y - cy, hull: [cx, cy] }));
  cur.qx = cx; cur.qy = cy; cur.hasQ = true; cur.hasC = false;
}

/** H/V/A/Z keep their own geometry here. */
function dispatchRest(cmd: PathCmd, cur: Cursor): void {
  const c = cmd.cmd.toUpperCase();
  if (c === "H" || c === "V") return axisLine(cmd, cur);
  if (c === "Z") return closePath(cur);
  if (c === "A") return arcTo(cmd, cur);
  bezierCmd(cmd, cur);
}

function axisLine(cmd: PathCmd, cur: Cursor): void {
  const v = cmd.nums[0];
  const rel = cmd.cmd === cmd.cmd.toLowerCase();
  const horizontal = cmd.cmd.toUpperCase() === "H";
  const x = horizontal ? (rel ? cur.x + v : v) : cur.x;
  const y = horizontal ? cur.y : (rel ? cur.y + v : v);
  pushSeg(cur, lineSeg([cur.x, cur.y], [x, y]));
  cur.hasC = false; cur.hasQ = false;
}

function closePath(cur: Cursor): void {
  const sub = last(cur.subs);
  if (sub === null) return;
  if (sub.segs.length > 0 || cur.x !== cur.sx || cur.y !== cur.sy) {
    pushSeg(cur, lineSeg([cur.x, cur.y], [cur.sx, cur.sy]));
  }
  sub.closed = true;
  cur.hasC = false; cur.hasQ = false;
}

function arcTo(cmd: PathCmd, cur: Cursor): void {
  const rel = cmd.cmd === cmd.cmd.toLowerCase();
  const end: [number, number] = rel
    ? [cur.x + cmd.nums[5], cur.y + cmd.nums[6]]
    : [cmd.nums[5], cmd.nums[6]];
  const arc = arcSeg([cur.x, cur.y], cmd.nums, end);
  pushSeg(cur, curveSeg(cur, { x: end[0], y: end[1], ax: arc.ax, ay: arc.ay, bx: arc.bx, by: arc.by, hull: arc.hull }));
  cur.hasC = false; cur.hasQ = false;
}

/** C/S/Q: control points join the hull; tangents run control→endpoint. */
function bezierCmd(cmd: PathCmd, cur: Cursor): void {
  const c = cmd.cmd.toUpperCase();
  if (c === "C") cubicTo(cmd, cur);
  else if (c === "S") smoothCubicTo(cmd, cur);
  else quadTo(cmd, cur);
}

function cubicTo(cmd: PathCmd, cur: Cursor): void {
  const [x1, y1] = pairAt(cmd, cur, 0);
  const [x2, y2] = pairAt(cmd, cur, 1);
  const [ex, ey] = pairAt(cmd, cur, 2);
  pushSeg(cur, curveSeg(cur, { x: ex, y: ey, ax: x1 - cur.x, ay: y1 - cur.y, bx: ex - x2, by: ey - y2, hull: [x1, y1, x2, y2] }));
  cur.c2x = x2; cur.c2y = y2; cur.hasC = true; cur.hasQ = false;
}

/** S: the first control is the reflection of the previous cubic control. */
function smoothCubicTo(cmd: PathCmd, cur: Cursor): void {
  const [x1, y1] = cur.hasC ? [2 * cur.x - cur.c2x, 2 * cur.y - cur.c2y] : [cur.x, cur.y];
  const [x2, y2] = pairAt(cmd, cur, 0);
  const [ex, ey] = pairAt(cmd, cur, 1);
  pushSeg(cur, curveSeg(cur, { x: ex, y: ey, ax: x1 - cur.x, ay: y1 - cur.y, bx: ex - x2, by: ey - y2, hull: [x1, y1, x2, y2] }));
  cur.c2x = x2; cur.c2y = y2; cur.hasC = true; cur.hasQ = false;
}

function quadTo(cmd: PathCmd, cur: Cursor): void {
  const [x1, y1] = pairAt(cmd, cur, 0);
  const [ex, ey] = pairAt(cmd, cur, 1);
  pushSeg(cur, curveSeg(cur, { x: ex, y: ey, ax: x1 - cur.x, ay: y1 - cur.y, bx: ex - x1, by: ey - y1, hull: [x1, y1] }));
  cur.qx = x1; cur.qy = y1; cur.hasQ = true; cur.hasC = false;
}

/** A curve segment: start + hull controls + end, with end tangents. */
interface CurveDraft {
  x: number; y: number;
  ax: number; ay: number; bx: number; by: number;
  hull: number[];
}

function curveSeg(cur: Cursor, d: CurveDraft): Seg {
  return {
    x1: cur.x, y1: cur.y, x2: d.x, y2: d.y,
    ax: d.ax, ay: d.ay, bx: d.bx, by: d.by,
    hull: [cur.x, cur.y, ...d.hull],
  };
}

function pushSeg(cur: Cursor, seg: Seg): void {
  const sub = last(cur.subs);
  if (sub === null) {
    cur.subs.push({ segs: [seg], closed: false });
    cur.x = seg.x2; cur.y = seg.y2;
    return;
  }
  if (seg.x1 !== seg.x2 || seg.y1 !== seg.y2) sub.segs.push(seg);
  cur.x = seg.x2; cur.y = seg.y2;
}

function last<T>(list: T[]): T | null {
  return list.length > 0 ? list[list.length - 1] : null;
}
