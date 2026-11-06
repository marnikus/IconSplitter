// tailcut.ts — the tail cutter (2026-11-06). Generated icons often have a line
// whose open END pierces another line a little: a short tail past the
// crossing. A TAIL is the stretch from the first crossing to an open end, at
// most `tolerance` long (the icon's own units — viewBox px). The search walks
// inward from every open end of every shape (closed shapes have no ends),
// flattening curves finely, and tests that walk against every other line —
// other shapes and far parts of the same path. Cutting trims the path exactly
// at the crossing (a curve is split there, so its shape is kept) and rewrites
// only the shapes it cut. Each shape is read in its own coordinates. Pure.

import { cubicAt, isLineSegment, segmentCubic, splitCubic, toPathData, subsOf, IDENTITY, type Anchor, type PathModel, type Pt, type SubPath } from "./pathedit/model";
import { loadObjects } from "./pathedit/objects";
import { pathTags, withPathDs } from "./pathedit/svgdoc";

export interface TailBox { x: number; y: number; width: number; height: number }

export interface Tail {
  /** The shape (its number among the file's drawn shapes). */
  shape: number;
  /** The subpath in the loaded model. */
  sub: number;
  end: "start" | "end";
  /** Where the cut goes: segment `seg` (from anchor seg to the next) at parameter `t`. */
  seg: number;
  t: number;
  cut: Pt;
  /** The tail's length from the crossing to the end. */
  length: number;
  /** The tail's bounding box (without padding). */
  box: TailBox;
}

interface Piece { sub: number; seg: number; t0: number; t1: number; a: Pt; b: Pt; x0: number; y0: number; x1: number; y1: number; seen: number }

const STEPS = 32;
const EPS = 1e-7;

const segCount = (s: SubPath): number => (s.closed ? s.anchors.length : s.anchors.length - 1);

/** Every segment of every subpath as straight pieces (curves in STEPS pieces), with their parameters. */
function pieces(m: PathModel): Piece[] {
  const out: Piece[] = [];
  m.subs.forEach((s, sub) => {
    for (let seg = 0; seg < segCount(s); seg++) {
      const c = segmentCubic(s, seg);
      if (c === null) continue;
      const n = isLineSegment(s, seg) ? 1 : STEPS;
      let a = c[0];
      for (let k = 0; k < n; k++) {
        const b = k + 1 === n ? c[3] : cubicAt(c, (k + 1) / n); // each point once
        out.push({ sub, seg, t0: k / n, t1: (k + 1) / n, a, b, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y), seen: 0 });
        a = b;
      }
    }
  });
  return out;
}

/** Where u→v crosses p→q: the parameter along u→v, or null. */
function cross(u: Pt, v: Pt, p: Pt, q: Pt): number | null {
  const rx = v.x - u.x, ry = v.y - u.y, sx = q.x - p.x, sy = q.y - p.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const r = ((p.x - u.x) * sy - (p.y - u.y) * sx) / den;
  const w = ((p.x - u.x) * ry - (p.y - u.y) * rx) / den;
  return r > EPS && r <= 1 + EPS && w >= -EPS && w <= 1 + EPS ? r : null;
}

/** One step of an end's walk: a piece directed away from the end, and how its direction maps to `t`. */
interface Step { seg: number; from: Pt; to: Pt; tFrom: number; tTo: number }

/** The walk inward from one open end of a subpath, only as far as a tail could reach. */
function walkOf(own: Piece[], end: "start" | "end", tolerance: number): Step[] {
  const out: Step[] = [];
  let length = 0;
  for (let k = 0; k < own.length && length <= tolerance; k++) {
    const p = own[end === "start" ? k : own.length - 1 - k];
    const step = end === "start"
      ? { seg: p.seg, from: p.a, to: p.b, tFrom: p.t0, tTo: p.t1 }
      : { seg: p.seg, from: p.b, to: p.a, tFrom: p.t1, tTo: p.t0 };
    out.push(step);
    length += Math.hypot(step.to.x - step.from.x, step.to.y - step.from.y);
  }
  return out;
}

/** The first crossing of one step with the lines it may meet (its own nearby segments excluded). */
function firstCross(step: Step, others: Piece[]): number | null {
  let best: number | null = null;
  for (const o of others) {
    const r = cross(step.from, step.to, o.a, o.b);
    if (r !== null && (best === null || r < best)) best = r;
  }
  return best;
}

function boxOf(points: Pt[]): TailBox {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Pieces bucketed in square cells about the tolerance in size, so an end only looks at its neighbourhood. */
interface Grid { cell: number; cells: Map<number, Piece[]>; query: number }

/** A numeric cell key (no string building per piece). */
const cellKey = (gx: number, gy: number): number => gx * 1_048_576 + gy;

function gridOf(all: Piece[], tolerance: number): Grid {
  const cell = Math.max(1, tolerance * 2);
  const cells = new Map<number, Piece[]>();
  for (const p of all) {
    for (let gx = Math.floor(p.x0 / cell); gx <= Math.floor(p.x1 / cell); gx++) {
      for (let gy = Math.floor(p.y0 / cell); gy <= Math.floor(p.y1 / cell); gy++) {
        const key = cellKey(gx, gy);
        const list = cells.get(key);
        if (list === undefined) cells.set(key, [p]); else list.push(p);
      }
    }
  }
  return { cell, cells, query: 0 };
}

/** The pieces a tail from `p` could meet: a tail never reaches further than `r` from its end (speed, 2026-11-06). */
function around(g: Grid, p: Pt, r: number): Piece[] {
  const found: Piece[] = [];
  const stamp = ++g.query; // a piece in two cells is taken once
  for (let gx = Math.floor((p.x - r) / g.cell); gx <= Math.floor((p.x + r) / g.cell); gx++) {
    for (let gy = Math.floor((p.y - r) / g.cell); gy <= Math.floor((p.y + r) / g.cell); gy++) {
      for (const q of g.cells.get(cellKey(gx, gy)) ?? []) {
        if (q.seen === stamp || q.x1 < p.x - r || q.x0 > p.x + r || q.y1 < p.y - r || q.y0 > p.y + r) continue;
        q.seen = stamp;
        found.push(q);
      }
    }
  }
  return found;
}

interface Lookup { grid: Grid; bySub: Map<number, Piece[]> }

/** The tail a crossing at `r` along `step` makes — null when it is too long (or sits right on the end). */
function tailFrom(c: { step: Step; r: number; length: number; walked: Pt[]; at: { sub: number; end: "start" | "end" } }, tolerance: number): Omit<Tail, "shape"> | null {
  if (c.length > tolerance || c.length < 1e-6) return null;
  const { step, r } = c;
  const cut = { x: step.from.x + (step.to.x - step.from.x) * r, y: step.from.y + (step.to.y - step.from.y) * r };
  return { sub: c.at.sub, end: c.at.end, seg: step.seg, t: step.tFrom + (step.tTo - step.tFrom) * r, cut, length: c.length, box: boxOf([...c.walked, cut]) };
}

/** The tail at one open end, if the first crossing is within `tolerance` of it. */
function tailAt(look: Lookup, at: { sub: number; end: "start" | "end" }, tolerance: number): Omit<Tail, "shape"> | null {
  const steps = walkOf(look.bySub.get(at.sub) ?? [], at.end, tolerance);
  if (steps.length === 0) return null;
  const near = new Set(steps.map((st) => st.seg)); // the walk only reaches as far as a tail could
  const others = around(look.grid, steps[0].from, tolerance + 1e-6).filter((p) => p.sub !== at.sub || !near.has(p.seg));
  const walked: Pt[] = [steps[0]?.from].filter((p): p is Pt => p !== undefined);
  let length = 0;
  for (const step of steps) {
    const len = Math.hypot(step.to.x - step.from.x, step.to.y - step.from.y);
    const r = firstCross(step, others);
    if (r !== null) return tailFrom({ step, r, length: length + len * r, walked, at }, tolerance);
    length += len;
    if (length > tolerance) return null;
    walked.push(step.to);
  }
  return null;
}

/** Every tail of the file, at most `tolerance` long (the icon's own units). */
export function findTails(source: string, tolerance: number): Tail[] {
  const count = pathTags(source).length;
  const model = loadObjects(source, Array.from({ length: count }, () => IDENTITY));
  const all = pieces(model);
  const grid = gridOf(all, tolerance);
  const bySub = new Map<number, Piece[]>();
  for (const p of all) { const list = bySub.get(p.sub) ?? []; list.push(p); bySub.set(p.sub, list); }
  const out: Tail[] = [];
  model.subs.forEach((s, sub) => {
    if (s.closed || s.anchors.length < 2) return;
    for (const end of ["start", "end"] as const) {
      const t = tailAt({ grid, bySub }, { sub, end }, tolerance);
      if (t !== null) out.push({ ...t, shape: s.owner ?? 0 });
    }
  });
  return out;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const anchor = (p: Pt, inH: Pt | null, outH: Pt | null): Anchor => ({ x: p.x, y: p.y, in: inH, out: outH, mode: inH && outH ? "smooth" : inH || outH ? "broken" : "corner" });

/** The subpath ending at (seg, t) instead of its last anchor. */
function cutEnd(s: SubPath, seg: number, t: number): SubPath {
  const c = segmentCubic(s, seg);
  const kept = s.anchors.slice(0, seg + 1).map((a) => ({ ...a }));
  if (c === null) return s;
  if (isLineSegment(s, seg)) return { ...s, anchors: [...kept, anchor(lerp(c[0], c[3], t), null, null)] };
  const [left] = splitCubic(c, t);
  kept[seg] = { ...kept[seg], out: left[1] };
  return { ...s, anchors: [...kept, anchor(left[3], left[2], null)] };
}

/** The subpath starting at (seg, t) instead of its first anchor. */
function cutStart(s: SubPath, seg: number, t: number): SubPath {
  const c = segmentCubic(s, seg);
  const kept = s.anchors.slice(seg + 1).map((a) => ({ ...a }));
  if (c === null) return s;
  if (isLineSegment(s, seg)) return { ...s, anchors: [anchor(lerp(c[0], c[3], t), null, null), ...kept] };
  const [, right] = splitCubic(c, t);
  kept[0] = { ...kept[0], in: right[2] };
  return { ...s, anchors: [anchor(right[0], null, right[1]), ...kept] };
}

/** Both ends of one subpath: the end first, then the start (re-scaled when both sit on one segment). */
function cutSub(s: SubPath, tails: Tail[]): SubPath {
  const end = tails.find((t) => t.end === "end");
  const start = tails.find((t) => t.end === "start");
  let out = end === undefined ? s : cutEnd(s, end.seg, end.t);
  if (start !== undefined) out = cutStart(out, start.seg, end !== undefined && end.seg === start.seg ? start.t / end.t : start.t);
  return out;
}

/** The file with every given tail cut at its crossing; null when there is nothing to cut. */
export function cutTails(source: string, tails: readonly Tail[]): string | null {
  if (tails.length === 0) return null;
  const count = pathTags(source).length;
  const model = loadObjects(source, Array.from({ length: count }, () => IDENTITY));
  const touched = new Set<number>();
  model.subs = model.subs.map((s, i) => {
    const mine = tails.filter((t) => t.sub === i);
    if (mine.length === 0) return s;
    touched.add(s.owner ?? 0);
    return cutSub(s, mine);
  });
  return withPathDs(source, new Map([...touched].map((shape) => [shape, toPathData(subsOf(model, shape))])));
}
