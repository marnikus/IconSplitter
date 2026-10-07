// epspath.ts — SVG geometry as absolute move/line/curve segments in PostScript
// coordinates (origin bottom-left, y up, points), plus the paint reader.
// Owns: every path command (arcs and quadratics become cubics), the shape
// elements as outlines, and colour parsing. It draws nothing.
//
// Arcs are converted with the standard centre construction split into 90°
// pieces; "approximate the arc with a line" would silently change the artwork,
// which is exactly what the EPS equivalence check exists to prevent.

import { arcToCubics, pathSegments, type Box } from "./svggeom";
import type { Point } from "./svgtransform";

export type Segment = { kind: "M" | "L" | "C"; p: Point; c1?: Point; c2?: Point };

/** A point in SVG user units -> the EPS page. */
export interface Mapper {
  (p: Point): Point;
}

export interface PathContext {
  /** SVG <path d> as segments; every command is absolute afterwards. */
  path: (d: string) => Segment[];
  /** rect/circle/ellipse/line/polyline/polygon as an outline. */
  shape: (tag: string, value: (name: string) => string) => Segment[];
}

export function pathContext(toEps: Mapper): PathContext {
  return { path: (d: string) => pathToSegments(d, toEps), shape: (tag, value) => outlineOf(tag, value, toEps) };
}

interface Walk {
  out: Segment[];
  at: Mapper;
  /** The cursor in SVG USER units — arcs and relative commands live there. */
  cursor: Point;
  start: Point;
  /** The previous cubic's second control, in user units, for S/T. */
  lastC2: Point | null;
}

function pathToSegments(d: string, at: Mapper): Segment[] {
  const walk: Walk = { out: [], at, cursor: { x: 0, y: 0 }, start: { x: 0, y: 0 }, lastC2: null };
  for (const seg of pathSegments(d)) step(walk, seg);
  return walk.out;
}

/** One command -> segments; S/T control points are made explicit here. */
/** One handler per command; the table keeps this file's branching flat (RULE 16). */
const STEPS: Record<string, (walk: Walk, args: number[], v: Rel) => void> = {
  M: (walk, a, v) => { const p = point(v, a, walk.cursor); walk.out.push({ kind: "M", p: walk.at(p) }); walk.start = p; move(walk, p); },
  L: (walk, a, v) => { const p = point(v, a, walk.cursor); walk.out.push({ kind: "L", p: walk.at(p) }); move(walk, p); },
  H: (walk, a, v) => { const p = { x: v(a[0], walk.cursor.x), y: walk.cursor.y }; walk.out.push({ kind: "L", p: walk.at(p) }); move(walk, p); },
  V: (walk, a, v) => { const p = { x: walk.cursor.x, y: v(a[0], walk.cursor.y) }; walk.out.push({ kind: "L", p: walk.at(p) }); move(walk, p); },
  C: (walk, a, v) => cubic(walk, a, true, v),
  S: (walk, a, v) => cubic(walk, a, false, v),
  Q: (walk, a, v) => quadratic(walk, a, true, v),
  T: (walk, a, v) => quadratic(walk, a, false, v),
  A: (walk, a) => arc(walk, a),
  Z: (walk) => move(walk, walk.start, true),
};

/** A relative argument's absolute value; the same closure for every handler. */
type Rel = (n: number, origin: number) => number;

function step(walk: Walk, seg: { cmd: string; args: number[] }): void {
  const cmd = seg.cmd.toUpperCase();
  const abs = seg.cmd === cmd;
  const v: Rel = (n, origin) => (abs ? n : origin + n);
  const handler = STEPS[cmd];
  if (handler !== undefined) handler(walk, seg.args, v);
}

function point(v: Rel, a: number[], from: Point): Point {
  return { x: v(a[0], from.x), y: v(a[1], from.y) };
}

function move(walk: Walk, p: Point, close = false): void {
  if (close) walk.out.push({ kind: "L", p: walk.at(p) });
  walk.cursor = p;
  walk.lastC2 = null;
}

function cubic(walk: Walk, args: number[], explicit: boolean, v: (n: number, o: number) => number): void {
  const { cursor } = walk;
  const c1 = explicit ? { x: v(args[0], cursor.x), y: v(args[1], cursor.y) } : reflect(walk, cursor);
  const rest = explicit ? args.slice(2) : args;
  const c2 = { x: v(rest[0], cursor.x), y: v(rest[1], cursor.y) };
  const p = { x: v(rest[2], cursor.x), y: v(rest[3], cursor.y) };
  walk.out.push({ kind: "C", c1: walk.at(c1), c2: walk.at(c2), p: walk.at(p) });
  walk.cursor = p;
  walk.lastC2 = c2;
}

/** A quadratic as the cubic it is identical to (controls 2/3 in). */
function quadratic(walk: Walk, args: number[], explicit: boolean, v: (n: number, o: number) => number): void {
  const { cursor } = walk;
  const q = explicit ? { x: v(args[0], cursor.x), y: v(args[1], cursor.y) } : reflect(walk, cursor);
  const rest = explicit ? args.slice(2) : args;
  const p = { x: v(rest[0], cursor.x), y: v(rest[1], cursor.y) };
  walk.out.push({
    kind: "C",
    c1: walk.at({ x: cursor.x + (2 / 3) * (q.x - cursor.x), y: cursor.y + (2 / 3) * (q.y - cursor.y) }),
    c2: walk.at({ x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }),
    p: walk.at(p),
  });
  walk.cursor = p;
  walk.lastC2 = null;
}

function arc(walk: Walk, args: number[]): void {
  const cubics = arcToCubics(walk.cursor, args);
  for (const c of cubics) {
    walk.out.push({ kind: "C", c1: walk.at(c.c1), c2: walk.at(c.c2), p: walk.at(c.end) });
  }
  walk.cursor = cubics.at(-1)?.end ?? walk.cursor;
  walk.lastC2 = null;
}

/** The control point a smooth command reflects; affine maps preserve this. */
function reflect(walk: Walk, cursor: Point): Point {
  if (walk.lastC2 === null) return { ...cursor };
  return { x: 2 * cursor.x - walk.lastC2.x, y: 2 * cursor.y - walk.lastC2.y };
}

/** rect/circle/ellipse/line/polyline/polygon as a closed (or open) outline. */
function outlineOf(tag: string, value: (name: string) => string, at: Mapper): Segment[] {
  const n = (name: string) => number(value(name));
  if (tag === "rect") {
    const x = n("x");
    const y = n("y");
    const w = n("width");
    const h = n("height");
    return [at({ x, y }), at({ x: x + w, y }), at({ x: x + w, y: y + h }), at({ x, y: y + h }), at({ x, y })]
      .map((p, i) => ({ kind: i === 0 ? "M" : "L", p }) as Segment);
  }
  if (tag === "circle") return ellipseOutline(at, { x: n("cx"), y: n("cy"), rx: n("r"), ry: n("r") });
  if (tag === "ellipse") return ellipseOutline(at, { x: n("cx"), y: n("cy"), rx: n("rx"), ry: n("ry") });
  if (tag === "line") return [{ kind: "M", p: at({ x: n("x1"), y: n("y1") }) }, { kind: "L", p: at({ x: n("x2"), y: n("y2") }) }];
  const pairs = pointsOf(value("points"));
  if (pairs.length < 2) return [];
  const segments = pairs.map((p, i) => ({ kind: (i === 0 ? "M" : "L") as "M" | "L", p: at(p) }));
  if (tag === "polygon") segments.push({ kind: "L", p: at(pairs[0]) });
  return segments;
}

/** A circle/ellipse as four cubic quadrants — the standard kappa construction. */
interface Oval { x: number; y: number; rx: number; ry: number }

/** A circle or an ellipse as the four cubic quadrants every renderer uses. */
function ellipseOutline(at: Mapper, { x: cx, y: cy, rx, ry }: Oval): Segment[] {
  const k = 0.5523;
  const out: Segment[] = [{ kind: "M", p: at({ x: cx + rx, y: cy }) }];
  const arcs: [number, number, number, number, number, number][] = [
    [cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry],
    [cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy],
    [cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry],
    [cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy],
  ];
  for (const [x1, y1, x2, y2, x3, y3] of arcs) {
    out.push({ kind: "C", c1: at({ x: x1, y: y1 }), c2: at({ x: x2, y: y2 }), p: at({ x: x3, y: y3 }) });
  }
  return out;
}

/** The four corners of a source box, mapped — the ink box in EPS points. */
export function mappedBox(box: Box, at: Mapper): Box {
  const corners = [
    { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y },
    { x: box.x, y: box.y + box.h }, { x: box.x + box.w, y: box.y + box.h },
  ].map(at);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** "#rrggbb" / "#rgb" / "rgb(r g b)" / a few names -> 0..1 triples, or null. */
export function colourOf(value: string): [number, number, number] | null {
  const text = value.trim().toLowerCase();
  if (text === "" || text === "none" || text.startsWith("url(")) return null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex !== null) {
    const full = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  if (rgb !== null) return [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(1, Number(n) / 255)) as [number, number, number];
  return NAMED[text] ?? (text === "currentcolor" ? [0, 0, 0] : null);
}

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [1, 1, 1], red: [1, 0, 0], green: [0, 128 / 255, 0],
  blue: [0, 0, 1], gray: [128 / 255, 128 / 255, 128 / 255], grey: [128 / 255, 128 / 255, 128 / 255],
  silver: [192 / 255, 192 / 255, 192 / 255], yellow: [1, 1, 0], orange: [1, 165 / 255, 0],
  purple: [128 / 255, 0, 128 / 255], navy: [0, 0, 128 / 255], teal: [0, 128 / 255, 128 / 255],
};

export function capOf(value: string): 0 | 1 | 2 {
  return value === "round" ? 1 : value === "square" ? 2 : 0;
}

export function joinOf(value: string): 0 | 1 | 2 {
  return value === "round" ? 1 : value === "bevel" ? 2 : 0;
}

export function pointsOf(value: string): Point[] {
  const list = (value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const out: Point[] = [];
  for (let i = 0; i + 1 < list.length; i += 2) out.push({ x: list[i], y: list[i + 1] });
  return out;
}

export function number(value: string): number {
  const n = Number(value.replace(/px$/i, ""));
  return Number.isFinite(n) ? n : 0;
}
