// inkbox.ts — an icon's REAL drawn bounds (2026-11-24). A sheet cell fits the
// icon by its ink, never by the generator's viewBox / artboard frame, so an
// icon drawn small in a big frame fills its cell like every other one.
// Pure arithmetic over the compiled nodes (cold path, once per icon, cached
// with them): tight curve extremes for cubic/quadratic Béziers, exact arc
// extremes (lib/upload/geom/arc), uniform transforms already folded in.
import { arcSeg } from "../upload/geom/arc";
import { scanPathCommands, type PathCmd } from "../upload/svgdirectpath";
import type { PreparedNode } from "./svgAssetNodes";

/** [x, y, width, height] in the icon's own viewBox units. */
export type InkBox = [number, number, number, number];

interface Acc { minX: number; minY: number; maxX: number; maxY: number }

const empty = (): Acc => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

function add(acc: Acc, x: number, y: number): void {
  if (x < acc.minX) acc.minX = x;
  if (x > acc.maxX) acc.maxX = x;
  if (y < acc.minY) acc.minY = y;
  if (y > acc.maxY) acc.maxY = y;
}

const boxOf = (acc: Acc): InkBox | null =>
  acc.minX <= acc.maxX && acc.minY <= acc.maxY ? [acc.minX, acc.minY, acc.maxX - acc.minX, acc.maxY - acc.minY] : null;

/** The drawn bounds of compiled nodes; null when nothing measurable is drawn (`use` alone, empty groups). */
export function inkBoxOf(nodes: readonly PreparedNode[]): InkBox | null {
  const acc = empty();
  for (const n of nodes) addNode(acc, n);
  return boxOf(acc);
}

function addNode(acc: Acc, n: PreparedNode): void {
  switch (n.kind) {
    case "path": return addPath(acc, n.cmds, n);
    case "rect": add(acc, n.x, n.y); return add(acc, n.x + n.w, n.y + n.h);
    case "circle": add(acc, n.cx - n.r, n.cy - n.r); return add(acc, n.cx + n.r, n.cy + n.r);
    case "ellipse": add(acc, n.cx - n.rx, n.cy - n.ry); return add(acc, n.cx + n.rx, n.cy + n.ry);
    case "line": add(acc, n.x1, n.y1); return add(acc, n.x2, n.y2);
    case "poly": for (let i = 0; i + 1 < n.pts.length; i += 2) add(acc, n.pts[i], n.pts[i + 1]); return;
    case "group": for (const c of n.children) addNode(acc, c); return;
    default: return; // `use`: its target's size is unknown — the rest decides
  }
}

/** One path's tight bounds in its own coordinates (tests, and the node walker). */
export function pathInkBox(d: string | readonly PathCmd[]): InkBox | null {
  const acc = empty();
  addPath(acc, typeof d === "string" ? scanPathCommands(d) : d, { s: 1, dx: 0, dy: 0 });
  return boxOf(acc);
}

/** Path walker state: current point, subpath start, last control point (S/T reflection). */
interface Pen { x: number; y: number; sx: number; sy: number; cx: number; cy: number; last: string }

/** The path's own uniform transform (scale, then offset) into the icon's viewBox units. */
interface Fold { s: number; dx: number; dy: number }

function addPath(acc: Acc, cmds: readonly PathCmd[], { s, dx, dy }: Fold): void {
  const local = empty();
  const pen: Pen = { x: 0, y: 0, sx: 0, sy: 0, cx: 0, cy: 0, last: "" };
  for (const c of cmds) stepCommand(local, pen, c);
  if (local.minX > local.maxX) return;
  add(acc, dx + s * local.minX, dy + s * local.minY);
  add(acc, dx + s * local.maxX, dy + s * local.maxY);
}

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function stepCommand(acc: Acc, pen: Pen, c: PathCmd): void {
  const up = c.cmd.toUpperCase();
  const rel = c.cmd !== up;
  const arity = ARITY[up] ?? 0;
  if (arity === 0) { closePath(pen); return; }
  for (let i = 0; i + arity <= c.args.length; i += arity) {
    const a = c.args.slice(i, i + arity);
    const kind = up === "M" && i > 0 ? "L" : up;
    segment(acc, pen, kind, rel ? offset(kind, a, pen) : a);
    pen.last = kind;
  }
}

function closePath(pen: Pen): void {
  pen.x = pen.sx;
  pen.y = pen.sy;
  pen.last = "Z";
}

/** Relative arguments → absolute (arc radii/flags and H/V single values handled). */
function offset(kind: string, a: number[], pen: Pen): number[] {
  if (kind === "H") return [a[0] + pen.x];
  if (kind === "V") return [a[0] + pen.y];
  if (kind === "A") return [a[0], a[1], a[2], a[3], a[4], a[5] + pen.x, a[6] + pen.y];
  return a.map((v, i) => v + (i % 2 === 0 ? pen.x : pen.y));
}

function segment(acc: Acc, pen: Pen, kind: string, a: number[]): void {
  if (kind === "M") return moveTo(pen, a[0], a[1]);
  if (kind === "L") return lineTo(acc, pen, a[0], a[1]);
  if (kind === "H") return lineTo(acc, pen, a[0], pen.y);
  if (kind === "V") return lineTo(acc, pen, pen.x, a[0]);
  if (kind === "C") return cubic(acc, pen, [a[0], a[1], a[2], a[3], a[4], a[5]]);
  if (kind === "S") return cubic(acc, pen, [...reflected(pen, "CS"), a[0], a[1], a[2], a[3]]);
  if (kind === "Q") return quad(acc, pen, [a[0], a[1], a[2], a[3]]);
  if (kind === "T") return quad(acc, pen, [...reflected(pen, "QT"), a[0], a[1]]);
  return arc(acc, pen, a);
}

/** A move draws nothing by itself: only the segments after it reach the bounds. */
function moveTo(pen: Pen, x: number, y: number): void {
  pen.x = pen.sx = pen.cx = x;
  pen.y = pen.sy = pen.cy = y;
}

function lineTo(acc: Acc, pen: Pen, x: number, y: number): void {
  add(acc, pen.x, pen.y);
  add(acc, x, y);
  pen.x = pen.cx = x;
  pen.y = pen.cy = y;
}

/** S/T: the previous control point mirrored through the current point (or the point itself). */
function reflected(pen: Pen, family: string): [number, number] {
  return family.includes(pen.last) && pen.last !== "" ? [2 * pen.x - pen.cx, 2 * pen.y - pen.cy] : [pen.x, pen.y];
}

function cubic(acc: Acc, pen: Pen, [x1, y1, x2, y2, x, y]: number[]): void {
  add(acc, pen.x, pen.y);
  add(acc, x, y);
  const xs = [pen.x, x1, x2, x];
  const ys = [pen.y, y1, y2, y];
  for (const t of [...cubicRoots(xs), ...cubicRoots(ys)]) add(acc, bez3(xs, t), bez3(ys, t));
  pen.cx = x2; pen.cy = y2; pen.x = x; pen.y = y;
}

function quad(acc: Acc, pen: Pen, [x1, y1, x, y]: number[]): void {
  add(acc, pen.x, pen.y);
  add(acc, x, y);
  for (const t of [quadRoot(pen.x, x1, x), quadRoot(pen.y, y1, y)]) {
    if (t !== null) add(acc, bez2(pen.x, x1, x, t), bez2(pen.y, y1, y, t));
  }
  pen.cx = x1; pen.cy = y1; pen.x = x; pen.y = y;
}

function arc(acc: Acc, pen: Pen, a: number[]): void {
  const seg = arcSeg([pen.x, pen.y], a, [a[5], a[6]]);
  for (let i = 0; i + 1 < seg.hull.length; i += 2) add(acc, seg.hull[i], seg.hull[i + 1]);
  pen.x = pen.cx = a[5];
  pen.y = pen.cy = a[6];
}

const bez3 = ([p0, p1, p2, p3]: number[], t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};
const bez2 = (p0: number, p1: number, p2: number, t: number) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;

/** t in (0, 1) where a cubic's derivative is zero on one axis. */
function cubicRoots([p0, p1, p2, p3]: number[]): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : inside([-c / b]);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const r = Math.sqrt(disc);
  return inside([(-b + r) / (2 * a), (-b - r) / (2 * a)]);
}

function quadRoot(p0: number, p1: number, p2: number): number | null {
  const den = p0 - 2 * p1 + p2;
  if (Math.abs(den) < 1e-12) return null;
  const t = (p0 - p1) / den;
  return t > 0 && t < 1 ? t : null;
}

const inside = (ts: number[]) => ts.filter((t) => t > 0 && t < 1);
