// outline.ts — the ONE outline model every shape compiles to (RULE 3,
// 2026-10-08): rect, circle, ellipse, line, polyline, polygon and the full path
// grammar (M/L/H/V/C/S/Q/T/A/Z, absolute and relative) as ABSOLUTE
// move/line/cubic/close ops. Arcs replay as cubic Béziers (≤90° each,
// k = 4/3·tan(Δθ/4)); quadratics lift to cubics (controls at 2/3 along the
// legs); circles/ellipses are the four-cubic KAPPA split. An affine map over
// the ops is exact (a Bézier's control points transform with it), which is
// what lets prepare bake every transform into the geometry and the EPS writer
// replay the same shape. Two writers: `outlineToPathData` here (SVG `d`),
// `epspath.ts` (PostScript).
// ideal-size: 270 lines reason=one grammar table with its handlers and the shape builders; splitting them from the model would hide the grammar

import { arcCenter, type ArcCenter } from "./arc";
import { applyM, type Matrix } from "./matrix";
import { tokenizePath, type PathCmd } from "./path";

export type OutlineOp =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

export interface Outline { ops: OutlineOp[] }

const KAPPA = 0.5522847498; // the circle-approximation constant

/** The shape element's outline; null when it is not a shape of the subset or has no geometry. */
export function shapeOutline(el: Element): Outline | null {
  switch (el.nodeName.toLowerCase()) {
    case "rect": return rectOutline(el);
    case "circle": return ellipseOutline(el, num(el.getAttribute("r")), num(el.getAttribute("r")));
    case "ellipse": return ellipseOutline(el, num(el.getAttribute("rx")), num(el.getAttribute("ry")));
    case "line": return lineOutline(el);
    case "polyline": return pointsOutline(el, false);
    case "polygon": return pointsOutline(el, true);
    case "path": return pathOutline(el.getAttribute("d"));
    default: return null;
  }
}

/** Every point (controls included) through the matrix. */
export function transformOutline(o: Outline, m: Matrix): Outline {
  return {
    ops: o.ops.map((op) => {
      if (op.op === "Z") return op;
      const [x, y] = applyM(m, op.x, op.y);
      if (op.op !== "C") return { op: op.op, x, y };
      const [x1, y1] = applyM(m, op.x1, op.y1);
      const [x2, y2] = applyM(m, op.x2, op.y2);
      return { op: "C", x1, y1, x2, y2, x, y };
    }),
  };
}

/** SVG path data: absolute commands, 3 decimals, no separators the grammar does not need. */
export function outlineToPathData(o: Outline): string {
  return o.ops.map((op) => {
    if (op.op === "Z") return "Z";
    if (op.op === "C") return `C${f(op.x1)} ${f(op.y1)} ${f(op.x2)} ${f(op.y2)} ${f(op.x)} ${f(op.y)}`;
    return `${op.op}${f(op.x)} ${f(op.y)}`;
  }).join("");
}

function f(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function rectOutline(el: Element): Outline | null {
  if (el.getAttribute("rx") !== null || el.getAttribute("ry") !== null) return null; // rounded: outside the subset
  const w = num(el.getAttribute("width"));
  const h = num(el.getAttribute("height"));
  if (!(w > 0) || !(h > 0)) return null;
  const x = num(el.getAttribute("x"));
  const y = num(el.getAttribute("y"));
  return { ops: [mv(x, y), ln(x + w, y), ln(x + w, y + h), ln(x, y + h), { op: "Z" }] };
}

/** Four cubics from (cx+rx, cy) clockwise; the circle is the rx = ry case. */
function ellipseOutline(el: Element, rx: number, ry: number): Outline | null {
  if (!(rx > 0) || !(ry > 0)) return null;
  const cx = num(el.getAttribute("cx"));
  const cy = num(el.getAttribute("cy"));
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  return { ops: [
    mv(cx + rx, cy),
    cv([cx + rx, cy + ky], [cx + kx, cy + ry], [cx, cy + ry]),
    cv([cx - kx, cy + ry], [cx - rx, cy + ky], [cx - rx, cy]),
    cv([cx - rx, cy - ky], [cx - kx, cy - ry], [cx, cy - ry]),
    cv([cx + kx, cy - ry], [cx + rx, cy - ky], [cx + rx, cy]),
    { op: "Z" },
  ] };
}

function lineOutline(el: Element): Outline {
  return { ops: [
    mv(num(el.getAttribute("x1")), num(el.getAttribute("y1"))),
    ln(num(el.getAttribute("x2")), num(el.getAttribute("y2"))),
  ] };
}

function pointsOutline(el: Element, closed: boolean): Outline | null {
  const raw = el.getAttribute("points");
  if (raw === null) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 4 || nums.length % 2 !== 0) return null;
  const ops: OutlineOp[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) ops.push(i === 0 ? mv(nums[i], nums[i + 1]) : ln(nums[i], nums[i + 1]));
  if (closed) ops.push({ op: "Z" });
  return { ops };
}

// --- path data ----------------------------------------------------------------

interface Cursor {
  x: number; y: number; sx: number; sy: number;
  c2x: number; c2y: number; qx: number; qy: number;
  hasC: boolean; hasQ: boolean;
  ops: OutlineOp[];
}

/** Path data → outline; null when the data has no commands. */
export function pathOutline(d: string | null): Outline | null {
  if (d === null || d.trim() === "") return null;
  const cur: Cursor = { x: 0, y: 0, sx: 0, sy: 0, c2x: 0, c2y: 0, qx: 0, qy: 0, hasC: false, hasQ: false, ops: [] };
  for (const cmd of tokenizePath(d)) HANDLERS[cmd.cmd.toUpperCase()]?.(cmd, cur);
  return cur.ops.length === 0 ? null : { ops: cur.ops };
}

const HANDLERS: Record<string, (cmd: PathCmd, cur: Cursor) => void> = {
  M: moveTo, L: lineTo, H: hLine, V: vLine, C: cubicTo, S: smoothCubicTo,
  Q: quadTo, T: smoothQuadTo, A: arcTo, Z: closePath,
};

/** Absolute/relative coordinate pair `i` of the command. */
function pt(cmd: PathCmd, cur: Cursor, i: number): [number, number] {
  return cmd.cmd === cmd.cmd.toLowerCase()
    ? [cur.x + cmd.nums[2 * i], cur.y + cmd.nums[2 * i + 1]]
    : [cmd.nums[2 * i], cmd.nums[2 * i + 1]];
}

/** Lands the pen; a straight step forgets any smooth control. */
function land(cur: Cursor, x: number, y: number): void {
  cur.x = x; cur.y = y;
  cur.hasC = false; cur.hasQ = false;
}

function moveTo(cmd: PathCmd, cur: Cursor): void {
  const [x, y] = pt(cmd, cur, 0);
  cur.ops.push(mv(x, y));
  cur.sx = x; cur.sy = y;
  land(cur, x, y);
}

function lineTo(cmd: PathCmd, cur: Cursor): void {
  const [x, y] = pt(cmd, cur, 0);
  cur.ops.push(ln(x, y));
  land(cur, x, y);
}

function hLine(cmd: PathCmd, cur: Cursor): void {
  const x = cmd.cmd === "h" ? cur.x + cmd.nums[0] : cmd.nums[0];
  cur.ops.push(ln(x, cur.y));
  land(cur, x, cur.y);
}

function vLine(cmd: PathCmd, cur: Cursor): void {
  const y = cmd.cmd === "v" ? cur.y + cmd.nums[0] : cmd.nums[0];
  cur.ops.push(ln(cur.x, y));
  land(cur, cur.x, y);
}

/** A cubic step: remembers its second control for a following S. */
function cubic(cur: Cursor, c1: number[], c2: number[], end: number[]): void {
  cur.ops.push(cv(c1, c2, end));
  cur.x = end[0]; cur.y = end[1];
  cur.c2x = c2[0]; cur.c2y = c2[1]; cur.hasC = true; cur.hasQ = false;
}

function cubicTo(cmd: PathCmd, cur: Cursor): void {
  cubic(cur, pt(cmd, cur, 0), pt(cmd, cur, 1), pt(cmd, cur, 2));
}

function smoothCubicTo(cmd: PathCmd, cur: Cursor): void {
  const c1 = cur.hasC ? [2 * cur.x - cur.c2x, 2 * cur.y - cur.c2y] : [cur.x, cur.y];
  cubic(cur, c1, pt(cmd, cur, 0), pt(cmd, cur, 1));
}

/** A quadratic lifts to a cubic: controls at 2/3 along the quad's legs. */
function quad(cur: Cursor, q: number[], end: number[]): void {
  const c1 = [cur.x + (2 / 3) * (q[0] - cur.x), cur.y + (2 / 3) * (q[1] - cur.y)];
  const c2 = [end[0] + (2 / 3) * (q[0] - end[0]), end[1] + (2 / 3) * (q[1] - end[1])];
  cubic(cur, c1, c2, end);
  cur.qx = q[0]; cur.qy = q[1]; cur.hasQ = true; cur.hasC = false;
}

function quadTo(cmd: PathCmd, cur: Cursor): void {
  quad(cur, pt(cmd, cur, 0), pt(cmd, cur, 1));
}

function smoothQuadTo(cmd: PathCmd, cur: Cursor): void {
  const q = cur.hasQ ? [2 * cur.x - cur.qx, 2 * cur.y - cur.qy] : [cur.x, cur.y];
  quad(cur, q, pt(cmd, cur, 0));
}

function arcTo(cmd: PathCmd, cur: Cursor): void {
  const n = cmd.nums;
  const end: [number, number] = cmd.cmd === "a" ? [cur.x + n[5], cur.y + n[6]] : [n[5], n[6]];
  if ((n[0] === 0 || n[1] === 0) || (end[0] === cur.x && end[1] === cur.y)) {
    cur.ops.push(ln(end[0], end[1])); // SVG: a zero radius is a straight line
  } else {
    for (const s of cubicSegments(arcCenter([cur.x, cur.y], n, end))) cur.ops.push(cv(s[0], s[1], s[2]));
  }
  land(cur, end[0], end[1]);
}

function closePath(_cmd: PathCmd, cur: Cursor): void {
  cur.ops.push({ op: "Z" });
  land(cur, cur.sx, cur.sy);
}

/** The arc as cubic segments: ≤90° each, k = 4/3·tan(Δθ/4). */
function cubicSegments(c: ArcCenter): number[][][] {
  const count = Math.max(1, Math.ceil(Math.abs(c.dTheta) / (Math.PI / 2) - 1e-9));
  const step = c.dTheta / count;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: number[][][] = [];
  for (let i = 0; i < count; i++) {
    const t0 = c.theta1 + i * step;
    const t1 = t0 + step;
    const p0 = arcPoint(c, t0);
    const p1 = arcPoint(c, t1);
    const d0 = arcTangent(c, t0);
    const d1 = arcTangent(c, t1);
    out.push([[p0[0] + k * d0[0], p0[1] + k * d0[1]], [p1[0] - k * d1[0], p1[1] - k * d1[1]], p1]);
  }
  return out;
}

function arcPoint(c: ArcCenter, t: number): [number, number] {
  const cos = Math.cos(c.phi);
  const sin = Math.sin(c.phi);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  return [
    c.cx + c.rx * c.scale * cos * ct - c.ry * c.scale * sin * st,
    c.cy + c.rx * c.scale * sin * ct + c.ry * c.scale * cos * st,
  ];
}

function arcTangent(c: ArcCenter, t: number): [number, number] {
  const cos = Math.cos(c.phi);
  const sin = Math.sin(c.phi);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  return [
    -c.rx * c.scale * cos * st - c.ry * c.scale * sin * ct,
    -c.rx * c.scale * sin * st + c.ry * c.scale * cos * ct,
  ];
}

const mv = (x: number, y: number): OutlineOp => ({ op: "M", x, y });
const ln = (x: number, y: number): OutlineOp => ({ op: "L", x, y });
const cv = (c1: number[], c2: number[], end: number[]): OutlineOp =>
  ({ op: "C", x1: c1[0], y1: c1[1], x2: c2[0], y2: c2[1], x: end[0], y: end[1] });

function num(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
