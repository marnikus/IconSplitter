// svgpath.ts — path data: tokens, boxes and arcs, without a browser (RULE 1/3).
// Owns: one tokeniser, the exact box of a path (curve extrema solved, not
// sampled), and the arc maths the EPS emitter reuses.
//
// Under-reporting is the one error that would crop an icon, so every extremum is
// computed from the specification: a cubic's derivative roots, a quadratic's
// single root, and an arc's centre parameterisation.

import type { Box, Point } from "./svgtransform";

export interface PathCommand { cmd: string; args: number[] }
export interface Cubic { p0: Point; c1: Point; c2: Point; p1: Point }

const CMD_ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Path data → absolute, upper-cased commands. A partial trailing command is dropped. */
export function pathSegments(d: string): PathCommand[] {
  const tokens = tokenisePath(d);
  const out: PathCommand[] = [];
  const walk = { cursor: { x: 0, y: 0 } as Point, start: { x: 0, y: 0 } as Point, current: "", index: 0 };
  while (walk.index < tokens.length) {
    const token = tokens[walk.index];
    if (token.cmd !== undefined) { walk.current = token.cmd; walk.index += 1; continue; }
    if (walk.current === "") { walk.index += 1; continue; }
    if (walk.current.toUpperCase() === "Z") { closePath(out, walk); continue; }
    const command = readCommand(tokens, walk);
    if (command === null) break;
    out.push(command);
  }
  return out;
}

function closePath(out: PathCommand[], walk: Walk): void {
  out.push({ cmd: "Z", args: [] });
  walk.cursor = { ...walk.start };
  walk.current = "";
}

interface Walk { cursor: Point; start: Point; current: string; index: number }

/** Reads one complete command; null when the data ends mid-command. */
function readCommand(tokens: Token[], walk: Walk): PathCommand | null {
  const upper = walk.current.toUpperCase();
  const size = CMD_ARGS[upper] ?? 0;
  const args = readArgs(tokens, walk.index, size);
  if (args === null) return null;
  const absolute = toAbsolute(upper, args, walk.cursor, walk.current !== upper);
  const command: PathCommand = { cmd: upper, args: absolute };
  walk.index += size;
  walk.cursor = advance(upper, absolute, walk.cursor);
  if (upper === "M") {
    // Extra coordinate pairs after a moveto are linetos (SVG path grammar).
    walk.current = walk.current === "M" ? "L" : "l";
    walk.start = { ...walk.cursor };
  }
  return command;
}

interface Token { cmd?: string; num?: number }

function tokenisePath(d: string): Token[] {
  const tokens: Token[] = [];
  const re = /([MmZzLlHhVvCcSsQqTtAa])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  for (const match of d.matchAll(re)) tokens.push(match[1] !== undefined ? { cmd: match[1] } : { num: Number(match[2]) });
  return tokens;
}

function readArgs(tokens: Token[], start: number, size: number): number[] | null {
  const args: number[] = [];
  for (let k = 0; k < size; k += 1) {
    const token = tokens[start + k];
    if (token?.num === undefined) return null;
    args.push(token.num);
  }
  return args;
}

function toAbsolute(cmd: string, args: number[], cursor: Point, relative: boolean): number[] {
  if (!relative) return args;
  const next = [...args];
  if (cmd === "H") next[0] += cursor.x;
  else if (cmd === "V") next[0] += cursor.y;
  else if (cmd === "A") { next[5] += cursor.x; next[6] += cursor.y; }
  else for (let i = 0; i < next.length - 1; i += 2) { next[i] += cursor.x; next[i + 1] += cursor.y; }
  return next;
}

function advance(cmd: string, args: number[], cursor: Point): Point {
  if (cmd === "M" || cmd === "L" || cmd === "T") return { x: args[0], y: args[1] };
  if (cmd === "H") return { x: args[0], y: cursor.y };
  if (cmd === "V") return { x: cursor.x, y: args[0] };
  if (cmd === "C") return { x: args[4], y: args[5] };
  if (cmd === "S" || cmd === "Q") return { x: args[2], y: args[3] };
  return { x: args[5], y: args[6] }; // the only command left that moves: A
}

interface Cursor { points: Point[]; cursor: Point; start: Point; lastC: Point | null; lastQ: Point | null }

const HANDLERS: Record<string, (c: Cursor, a: number[]) => void> = {
  M: (c, a) => { c.cursor = { x: a[0], y: a[1] }; c.start = c.cursor; c.lastC = c.lastQ = null; c.points.push(c.cursor); },
  L: (c, a) => { c.cursor = { x: a[0], y: a[1] }; c.lastC = c.lastQ = null; c.points.push(c.cursor); },
  H: (c, a) => { c.cursor = { x: a[0], y: c.cursor.y }; c.lastC = c.lastQ = null; c.points.push(c.cursor); },
  V: (c, a) => { c.cursor = { x: c.cursor.x, y: a[0] }; c.lastC = c.lastQ = null; c.points.push(c.cursor); },
  C: (c, a) => { curve(c, { x: a[0], y: a[1] }, { x: a[2], y: a[3] }, { x: a[4], y: a[5] }); },
  S: (c, a) => { curve(c, reflect(c.lastC, c.cursor), { x: a[0], y: a[1] }, { x: a[2], y: a[3] }); },
  Q: (c, a) => { quad(c, { x: a[0], y: a[1] }, { x: a[2], y: a[3] }); },
  T: (c, a) => { quad(c, reflect(c.lastQ, c.cursor), { x: a[0], y: a[1] }); },
  A: (c, a) => { appendArc(c, a); },
  Z: (c) => { c.cursor = c.start; c.lastC = c.lastQ = null; c.points.push(c.cursor); },
};

/** The box of `path` data, or null when it draws nothing measurable. */
export function pathBox(d: string): Box | null {
  const state: Cursor = { points: [], cursor: { x: 0, y: 0 }, start: { x: 0, y: 0 }, lastC: null, lastQ: null };
  for (const seg of pathSegments(d)) {
    (HANDLERS[seg.cmd] ?? HANDLERS.L)(state, seg.args);
  }
  return state.points.length === 0 ? null : around(state.points);
}

/** One cubic: the box walker keeps its own control point for the next smooth step. */
function curve(c: Cursor, c1: Point, c2: Point, p1: Point): void {
  c.points.push(...cubicPoints({ p0: c.cursor, c1, c2, p1 }));
  c.cursor = p1;
  c.lastC = c2;
  c.lastQ = null;
}

function quad(c: Cursor, q: Point, p1: Point): void {
  c.points.push(...quadPoints(c.cursor, q, p1));
  c.cursor = p1;
  c.lastQ = q;
  c.lastC = null;
}

function appendArc(c: Cursor, a: number[]): void {
  const arc = arcOf(c.cursor, a);
  if (arc === null) c.points.push({ x: a[5], y: a[6] });
  else c.points.push(...arcPoints(arc));
  c.cursor = { x: a[5], y: a[6] };
  c.lastC = c.lastQ = null;
}

function reflect(last: Point | null, cursor: Point): Point {
  return last === null ? { ...cursor } : { x: 2 * cursor.x - last.x, y: 2 * cursor.y - last.y };
}

/** The cubic's own extremes: the end points plus the roots of its derivative. */
export function cubicPoints(cubic: Cubic): Point[] {
  const { p0, c1, c2, p1 } = cubic;
  const points = [p0, p1];
  for (const axis of ["x", "y"] as const) {
    const a = -p0[axis] + 3 * c1[axis] - 3 * c2[axis] + p1[axis];
    const b = 2 * (p0[axis] - 2 * c1[axis] + c2[axis]);
    const c = c1[axis] - p0[axis];
    for (const root of quadraticRoots(a, b, c)) if (root > 0 && root < 1) points.push(cubicAt(cubic, root));
  }
  return points;
}

export function cubicAt(cubic: Cubic, t: number): Point {
  const { p0, c1, c2, p1 } = cubic;
  const u = 1 - t;
  const [b0, b1, b2, b3] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: b0 * p0.x + b1 * c1.x + b2 * c2.x + b3 * p1.x, y: b0 * p0.y + b1 * c1.y + b2 * c2.y + b3 * p1.y };
}

export function quadPoints(p0: Point, q: Point, p1: Point): Point[] {
  const points = [p0, p1];
  for (const axis of ["x", "y"] as const) {
    const den = p0[axis] - 2 * q[axis] + p1[axis];
    if (den === 0) continue;
    const t = (p0[axis] - q[axis]) / den;
    if (t > 0 && t < 1) points.push({ x: p0.x + 2 * t * (q.x - p0.x) + t * t * (p0.x - 2 * q.x + p1.x), y: p0.y + 2 * t * (q.y - p0.y) + t * t * (p0.y - 2 * q.y + p1.y) });
  }
  return points;
}

export function quadraticRoots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
}

export function around(points: Point[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export interface Arc { cx: number; cy: number; rx: number; ry: number; phi: number; t1: number; dt: number }

/** An arc in centre form (SVG spec F.6.5); null when it is really a line. */
export function arcOf(from: Point, a: number[]): Arc | null {
  let [rx, ry] = [Math.abs(a[0]), Math.abs(a[1])];
  if (rx === 0 || ry === 0) return null;
  const phi = (a[2] * Math.PI) / 180;
  const x1 = Math.cos(phi) * ((from.x - a[5]) / 2) + Math.sin(phi) * ((from.y - a[6]) / 2);
  const y1 = -Math.sin(phi) * ((from.x - a[5]) / 2) + Math.cos(phi) * ((from.y - a[6]) / 2);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const num = Math.max(0, rx * rx * ry * ry - den);
  const coef = (a[3] !== a[4] ? 1 : -1) * (den === 0 ? 0 : Math.sqrt(num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const centre = { x: Math.cos(phi) * cx1 - Math.sin(phi) * cy1 + (from.x + a[5]) / 2, y: Math.sin(phi) * cx1 + Math.cos(phi) * cy1 + (from.y + a[6]) / 2 };
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (a[4] === 0 && dt > 0) dt -= 2 * Math.PI;
  if (a[4] === 1 && dt < 0) dt += 2 * Math.PI;
  return { cx: centre.x, cy: centre.y, rx, ry, phi, t1, dt };
}

function angle(ux: number, uy: number, vx: number, vy: number): number {
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  return sign * Math.acos(Math.min(1, Math.max(-1, len === 0 ? 0 : (ux * vx + uy * vy) / len)));
}

export function pointOnArc(arc: Arc, t: number): Point {
  const cos = Math.cos(arc.phi);
  const sin = Math.sin(arc.phi);
  const x = arc.rx * Math.cos(t);
  const y = arc.ry * Math.sin(t);
  return { x: arc.cx + cos * x - sin * y, y: arc.cy + sin * x + cos * y };
}

/** The arc's real extremes: its end points plus the angles where dx or dy is 0. */
function arcPoints(arc: Arc): Point[] {
  const points = [pointOnArc(arc, arc.t1), pointOnArc(arc, arc.t1 + arc.dt)];
  const start = arc.dt >= 0 ? arc.t1 : arc.t1 + arc.dt;
  const sweep = Math.abs(arc.dt);
  for (const base of [0, Math.PI]) {
    const tx = Math.atan2(-arc.ry * Math.sin(arc.phi), arc.rx * Math.cos(arc.phi)) + base;
    const ty = Math.atan2(arc.ry * Math.cos(arc.phi), arc.rx * Math.sin(arc.phi)) + base;
    for (const t of [tx, ty]) if (within(t, start, sweep)) points.push(pointOnArc(arc, t));
  }
  return points;
}

function within(t: number, start: number, sweep: number): boolean {
  let delta = (t - start) % (2 * Math.PI);
  if (delta < 0) delta += 2 * Math.PI;
  return delta <= sweep + 1e-9;
}

/** An arc as cubics no wider than 90°, each correct to well under a pixel. */
export function arcToCubics(from: Point, a: number[]): { c1: Point; c2: Point; end: Point }[] {
  const arc = arcOf(from, a);
  const end = { x: a[5], y: a[6] };
  if (arc === null) return [{ c1: { ...end }, c2: { ...end }, end }];
  const count = Math.max(1, Math.ceil(Math.abs(arc.dt) / (Math.PI / 2)));
  const step = arc.dt / count;
  return Array.from({ length: count }, (_, i) => cubicSlice(arc, arc.t1 + step * i, step));
}

function cubicSlice(arc: Arc, t0: number, step: number): { c1: Point; c2: Point; end: Point } {
  const t1 = t0 + step;
  const k = (4 / 3) * Math.tan(step / 4);
  const p0 = pointOnArc(arc, t0);
  const p1 = pointOnArc(arc, t1);
  const d0 = derivative(arc, t0);
  const d1 = derivative(arc, t1);
  return { c1: { x: p0.x + k * d0.x, y: p0.y + k * d0.y }, c2: { x: p1.x - k * d1.x, y: p1.y - k * d1.y }, end: p1 };
}

function derivative(arc: Arc, t: number): Point {
  const cos = Math.cos(arc.phi);
  const sin = Math.sin(arc.phi);
  const dx = -arc.rx * Math.sin(t);
  const dy = arc.ry * Math.cos(t);
  return { x: cos * dx - sin * dy, y: sin * dx + cos * dy };
}
