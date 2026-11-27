// strokering.ts — the outline of a pen stroke (2026-11-27): one line (open or
// closed) of half-width `h` as closed rings of curves and lines. Each side is
// the line moved sideways by `h` — curves stay curves (cut where they turn
// more than 30° and moved piece by piece) — corners are joined (round, miter
// within its limit, else bevel), open ends are capped (butt, round, square).
// An open line gives one ring; a closed line two, wound opposite ways, so the
// nonzero rule leaves its middle empty. The inner side of a tight corner may
// loop over itself: the nonzero rule still paints exactly the pen. Pure.

import { anySubSegs, reverseSeg, splitCubic4, type Cubic, type CurveSeg } from "./curvecut";
import type { Pt, SubPath } from "./model";

export interface Pen { cap: "butt" | "round" | "square"; join: "miter" | "round" | "bevel"; miter: number }

interface Piece { seg: CurveSeg; t0: Pt; t1: Pt }

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const left = (t: Pt): Pt => ({ x: -t.y, y: t.x });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
const far = (a: Pt, b: Pt): boolean => Math.hypot(a.x - b.x, a.y - b.y) > 1e-9;
const line = (a: Pt, b: Pt): CurveSeg => ({ c: [a, a, b, b], line: true });

function unit(v: Pt): Pt | null {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-12 ? null : { x: v.x / l, y: v.y / l };
}

/** The directions a segment leaves and arrives with (a handle lying on its anchor falls back to the next point). */
function ends(e: CurveSeg): { t0: Pt; t1: Pt } | null {
  const [p0, p1, p2, p3] = e.c;
  const chord = unit(sub(p3, p0));
  const t0 = e.line ? chord : unit(sub(p1, p0)) ?? unit(sub(p2, p0)) ?? chord;
  const t1 = e.line ? chord : unit(sub(p3, p2)) ?? unit(sub(p3, p1)) ?? chord;
  return t0 === null || t1 === null ? null : { t0, t1 };
}

const turnOf = (a: Pt | null, b: Pt | null): number => (a === null || b === null ? 0 : Math.abs(Math.atan2(cross(a, b), dot(a, b))));

/** A curve cut into pieces that each turn at most 30°, so a moved piece stays true to the pen. */
function cutByTurn(e: CurveSeg): CurveSeg[] {
  if (e.line) return [e];
  const [p0, p1, p2, p3] = e.c;
  const [a, b, c] = [unit(sub(p1, p0)), unit(sub(p2, p1)), unit(sub(p3, p2))];
  const n = Math.max(1, Math.min(12, Math.ceil((turnOf(a, b) + turnOf(b, c)) / (Math.PI / 6))));
  const out: CurveSeg[] = [];
  let rest: Cubic = e.c;
  for (let k = 0; k < n - 1; k++) {
    const [head, tail] = splitCubic4(rest, 1 / (n - k));
    out.push({ c: head, line: false });
    rest = tail;
  }
  out.push({ c: rest, line: false });
  return out;
}

function piecesOf(s: SubPath): Piece[] {
  return anySubSegs(s).flatMap(cutByTurn).flatMap((seg) => {
    const t = ends(seg);
    return t === null ? [] : [{ seg, ...t }];
  });
}

/** One piece moved sideways by `d` (to its left when positive). */
function moved(p: Piece, d: number): CurveSeg {
  const [p0, p1, p2, p3] = p.seg.c;
  const q0 = add(p0, left(p.t0), d), q3 = add(p3, left(p.t1), d);
  if (p.seg.line) return line(q0, q3);
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const k = chord < 1e-9 ? 1 : Math.hypot(q3.x - q0.x, q3.y - q0.y) / chord;
  return { c: [q0, add(q0, sub(p1, p0), k), add(q3, sub(p2, p3), k), q3], line: false };
}

/** An arc round `c` from angle `a0` over `sweep`, as cubics of at most a quarter turn. */
function arc(c: Pt, r: number, a0: number, sweep: number): CurveSeg[] {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const step = sweep / n, k = (4 / 3) * Math.tan(step / 4) * r;
  const at = (a: number): Pt => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  const dir = (a: number): Pt => ({ x: -Math.sin(a), y: Math.cos(a) });
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + step * i, b = a + step;
    return { c: [at(a), add(at(a), dir(a), k), add(at(b), dir(b), -k), at(b)] as Cubic, line: false };
  });
}

/** The corner at `v` on the side moved by `d`: from the arriving piece's end to the leaving piece's start. */
function joinAt(v: Pt, [tIn, tOut]: readonly [Pt, Pt], d: number, pen: Pen): CurveSeg[] {
  const u0 = left(tIn), u1 = left(tOut);
  const a = add(v, u0, d), b = add(v, u1, d);
  if (!far(a, b)) return [];
  const outer = d * cross(tIn, tOut) < 0;
  if (!outer || pen.join === "bevel") return [line(a, b)];
  if (pen.join === "round") return arc(v, Math.abs(d), Math.atan2(u0.y * d, u0.x * d), Math.atan2(cross(u0, u1), dot(u0, u1)));
  const half = Math.sqrt(Math.max(0, (1 + dot(u0, u1)) / 2));
  if (half < 1e-6 || 1 / half > pen.miter) return [line(a, b)];
  const tip = add(v, add(u0, u1), d / (1 + dot(u0, u1)));
  return [line(a, tip), line(tip, b)];
}

/** One side of the line, moved by `d`, corners joined; a closed line also joins its last piece to its first. */
function side(pieces: readonly Piece[], d: number, pen: Pen, closed: boolean): CurveSeg[] {
  const out: CurveSeg[] = [];
  pieces.forEach((p, i) => {
    if (i > 0) out.push(...joinAt(p.seg.c[0], [pieces[i - 1].t1, p.t0], d, pen));
    out.push(moved(p, d));
  });
  const first = pieces[0], last = pieces[pieces.length - 1];
  if (closed) out.push(...joinAt(first.seg.c[0], [last.t1, first.t0], d, pen));
  return out;
}

/** The end of an open line at `p` heading `t`: from its left edge round to its right edge. */
function capAt(p: Pt, t: Pt, h: number, pen: Pen): CurveSeg[] {
  const n = left(t);
  const a = add(p, n, h), b = add(p, n, -h);
  if (pen.cap === "round") return arc(p, h, Math.atan2(n.y, n.x), -Math.PI);
  if (pen.cap === "butt") return [line(a, b)];
  const a2 = add(a, t, h), b2 = add(b, t, h);
  return [line(a, a2), line(a2, b2), line(b2, b)];
}

const backwards = (segs: readonly CurveSeg[]): CurveSeg[] => [...segs].reverse().map(reverseSeg);
const flip = (t: Pt): Pt => ({ x: -t.x, y: -t.y });
const solid = (segs: readonly CurveSeg[]): CurveSeg[] => segs.filter((e) => !e.line || far(e.c[0], e.c[3]));

/** The pen's outline of subpath `s` with half-width `h`, as closed rings (none when the line has no length). */
export function strokeRings(s: SubPath, h: number, pen: Pen): CurveSeg[][] {
  const pieces = piecesOf(s);
  if (pieces.length === 0 || !(h > 0)) return [];
  const one = side(pieces, h, pen, s.closed), other = backwards(side(pieces, -h, pen, s.closed));
  if (s.closed) return [solid(one), solid(other)];
  const first = pieces[0], last = pieces[pieces.length - 1];
  return [solid([...one, ...capAt(last.seg.c[3], last.t1, h, pen), ...other, ...capAt(first.seg.c[0], flip(first.t0), h, pen)])];
}
