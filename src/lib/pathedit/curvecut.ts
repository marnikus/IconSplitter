// curvecut.ts — exact cubic-Bezier / line arrangement & ray-winding primitives
// for boolean region cuts (2026-11-20): splits closed subpaths at every curve
// crossing and shared-edge transition while keeping true cubic handles intact.

import { cubicAt, isLineSegment, segmentCubic, splitCubic, type Pt, type SubPath } from "./model";

export type Cubic = [Pt, Pt, Pt, Pt];
export interface CurveSeg { c: Cubic; line: boolean }
export interface GraphEdge { u: number; v: number; seg: CurveSeg }

export const splitCubic4 = (c: Cubic, t: number): [Cubic, Cubic] => splitCubic(c, t) as [Cubic, Cubic];

interface Chord { seg: number; t0: number; t1: number; a: Pt; b: Pt; x0: number; y0: number; x1: number; y1: number }

const CHORDS = 24;
const EPS = 1e-9;
const T_EPS = 1e-5;
const SNAP = 1e-3;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export const segAt = (e: CurveSeg, t: number): Pt => (e.line ? lerp(e.c[0], e.c[3], t) : cubicAt(e.c, t));

export const reverseSeg = (e: CurveSeg): CurveSeg => ({ c: [e.c[3], e.c[2], e.c[1], e.c[0]], line: e.line });

export function subToSegs(s: SubPath): CurveSeg[] {
  if (!s.closed || s.anchors.length < 3) return [];
  const out: CurveSeg[] = [];
  for (let i = 0; i < s.anchors.length; i++) {
    const c = segmentCubic(s, i);
    if (c !== null && cSpan(c) > 1e-6) out.push({ c, line: isLineSegment(s, i) });
  }
  return out;
}

const cSpan = (c: Cubic): number =>
  Math.max(dist(c[0], c[3]), dist(c[0], c[1]), dist(c[0], c[2]));

function segDeriv(e: CurveSeg, t: number): Pt {
  const [p0, p1, p2, p3] = e.c;
  if (e.line) return { x: p3.x - p0.x, y: p3.y - p0.y };
  const m = 1 - t;
  return {
    x: 3 * m * m * (p1.x - p0.x) + 6 * m * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * m * m * (p1.y - p0.y) + 6 * m * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

const chordCross = (a: Pt, b: Pt, y: number): number => (b.y > y ? 1 : 0) - (a.y > y ? 1 : 0);

function lineRayWinding(a: Pt, b: Pt, p: Pt): number {
  const d = chordCross(a, b, p.y);
  if (d === 0) return 0;
  return a.x + ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) > p.x ? d : 0;
}

function cubicRayWinding(c: Cubic, p: Pt, depth = 0): number {
  const x0 = Math.min(c[0].x, c[1].x, c[2].x, c[3].x), x1 = Math.max(c[0].x, c[1].x, c[2].x, c[3].x);
  const y0 = Math.min(c[0].y, c[1].y, c[2].y, c[3].y), y1 = Math.max(c[0].y, c[1].y, c[2].y, c[3].y);
  if (x1 <= p.x || y1 <= p.y || y0 > p.y) return 0;
  if (x0 > p.x) return chordCross(c[0], c[3], p.y);
  if (depth >= 14) return lineRayWinding(c[0], c[3], p);
  const [l, r] = splitCubic4(c, 0.5);
  return cubicRayWinding(l, p, depth + 1) + cubicRayWinding(r, p, depth + 1);
}

export function segsWinding(segs: readonly CurveSeg[], p: Pt): number {
  let sum = 0;
  for (const e of segs) sum += e.line ? lineRayWinding(e.c[0], e.c[3], p) : cubicRayWinding(e.c, p);
  return sum;
}

export function ringsPaint(rings: readonly (readonly CurveSeg[])[], rule: "evenodd" | "nonzero", p: Pt): boolean {
  if (rule === "evenodd") return rings.filter((r) => segsWinding(r, p) % 2 !== 0).length % 2 === 1;
  return rings.reduce((sum, r) => sum + segsWinding(r, p), 0) !== 0;
}

function chordsOf(e: CurveSeg, seg: number): Chord[] {
  const n = e.line ? 1 : CHORDS;
  const out: Chord[] = [];
  let a = e.c[0];
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const b = k + 1 === n ? e.c[3] : cubicAt(e.c, t1);
    out.push({ seg, t0, t1, a, b, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
    a = b;
  }
  return out;
}

function meetChords(p: Chord, q: Chord): [number, number] | null {
  if (q.x1 < p.x0 - 1e-4 || q.x0 > p.x1 + 1e-4 || q.y1 < p.y0 - 1e-4 || q.y0 > p.y1 + 1e-4) return null;
  const rx = p.b.x - p.a.x, ry = p.b.y - p.a.y, sx = q.b.x - q.a.x, sy = q.b.y - q.a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-11) return null;
  const r = ((q.a.x - p.a.x) * sy - (q.a.y - p.a.y) * sx) / den;
  const w = ((q.a.x - p.a.x) * ry - (q.a.y - p.a.y) * rx) / den;
  if (r < -1e-4 || r > 1 + 1e-4 || w < -1e-4 || w > 1 + 1e-4) return null;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return [p.t0 + (p.t1 - p.t0) * clamp(r), q.t0 + (q.t1 - q.t0) * clamp(w)];
}

function refinePair(a: CurveSeg, b: CurveSeg, t0: number, u0: number): [number, number] {
  let t = t0, u = u0;
  for (let k = 0; k < 8; k++) {
    const pa = segAt(a, t), pb = segAt(b, u);
    const fx = pa.x - pb.x, fy = pa.y - pb.y;
    if (Math.hypot(fx, fy) < EPS) break;
    const da = segDeriv(a, t), db = segDeriv(b, u);
    const det = -da.x * db.y + da.y * db.x;
    if (Math.abs(det) < 1e-12) break;
    t = Math.max(0, Math.min(1, t + (fx * db.y - fy * db.x) / det));
    u = Math.max(0, Math.min(1, u - (da.x * fy - da.y * fx) / det));
  }
  return [t, u];
}

function projectLinePt(e: CurveSeg, p: Pt): number | null {
  const dx = e.c[3].x - e.c[0].x, dy = e.c[3].y - e.c[0].y, len2 = dx * dx + dy * dy;
  if (len2 < EPS) return null;
  const t = ((p.x - e.c[0].x) * dx + (p.y - e.c[0].y) * dy) / len2;
  return t > T_EPS && t < 1 - T_EPS && dist(segAt(e, t), p) < SNAP ? t : null;
}

function cubicNearBox(c: Cubic, p: Pt, pad: number): boolean {
  return p.x >= Math.min(c[0].x, c[1].x, c[2].x, c[3].x) - pad && p.x <= Math.max(c[0].x, c[1].x, c[2].x, c[3].x) + pad
    && p.y >= Math.min(c[0].y, c[1].y, c[2].y, c[3].y) - pad && p.y <= Math.max(c[0].y, c[1].y, c[2].y, c[3].y) + pad;
}

function projectCubicPt(e: CurveSeg, p: Pt): number | null {
  if (!cubicNearBox(e.c, p, SNAP * 2)) return null;
  let best = 0.5, bestD = Infinity;
  for (let k = 0; k <= CHORDS; k++) {
    const d = dist(cubicAt(e.c, k / CHORDS), p);
    if (d < bestD) { bestD = d; best = k / CHORDS; }
  }
  if (bestD > 4) return null;
  for (let k = 0; k < 6; k++) {
    const q = cubicAt(e.c, best), d = segDeriv(e, best), den = d.x * d.x + d.y * d.y;
    if (den < EPS) break;
    best = Math.max(0, Math.min(1, best - ((q.x - p.x) * d.x + (q.y - p.y) * d.y) / den));
  }
  return best > T_EPS && best < 1 - T_EPS && dist(cubicAt(e.c, best), p) < SNAP ? best : null;
}

const projectPt = (e: CurveSeg, p: Pt): number | null => (e.line ? projectLinePt(e, p) : projectCubicPt(e, p));

function segsApart(a: CurveSeg, b: CurveSeg): boolean {
  const ax0 = Math.min(a.c[0].x, a.c[1].x, a.c[2].x, a.c[3].x), ax1 = Math.max(a.c[0].x, a.c[1].x, a.c[2].x, a.c[3].x);
  const bx0 = Math.min(b.c[0].x, b.c[1].x, b.c[2].x, b.c[3].x), bx1 = Math.max(b.c[0].x, b.c[1].x, b.c[2].x, b.c[3].x);
  if (bx1 < ax0 - SNAP || bx0 > ax1 + SNAP) return true;
  const ay0 = Math.min(a.c[0].y, a.c[1].y, a.c[2].y, a.c[3].y), ay1 = Math.max(a.c[0].y, a.c[1].y, a.c[2].y, a.c[3].y);
  const by0 = Math.min(b.c[0].y, b.c[1].y, b.c[2].y, b.c[3].y), by1 = Math.max(b.c[0].y, b.c[1].y, b.c[2].y, b.c[3].y);
  return by1 < ay0 - SNAP || by0 > ay1 + SNAP;
}

export function hasAnyCrossing(a: readonly CurveSeg[], b: readonly CurveSeg[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segsApart(a[i], b[j])) continue;
      const ca = chordsOf(a[i], i), cb = chordsOf(b[j], j);
      if (ca.some((p) => cb.some((q) => meetChords(p, q) !== null))) return true;
    }
  }
  const endsA = a.flatMap((e) => [e.c[0], e.c[3]]), endsB = b.flatMap((e) => [e.c[0], e.c[3]]);
  if (endsA.some((pa) => endsB.some((pb) => dist(pa, pb) < SNAP))) return true;
  return endsA.some((p) => b.some((e) => projectPt(e, p) !== null))
    || endsB.some((p) => a.some((e) => projectPt(e, p) !== null));
}

function collectSplits(segs: readonly CurveSeg[]): number[][] {
  const splits = segs.map(() => [] as number[]);
  const chords = segs.map((e, i) => chordsOf(e, i));
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (!segsApart(segs[i], segs[j])) crossPair(segs, chords, splits, [i, j]);
    }
    for (const end of [segs[i].c[0], segs[i].c[3]]) projectEnd(segs, splits, end);
  }
  return splits;
}

function crossPair(segs: readonly CurveSeg[], chords: Chord[][], splits: number[][], [i, j]: [number, number]): void {
  for (const p of chords[i]) {
    for (const q of chords[j]) {
      const hit = meetChords(p, q);
      if (hit === null) continue;
      const [ti, tj] = refinePair(segs[i], segs[j], hit[0], hit[1]);
      if (ti > T_EPS && ti < 1 - T_EPS) splits[i].push(ti);
      if (tj > T_EPS && tj < 1 - T_EPS) splits[j].push(tj);
    }
  }
}

function projectEnd(segs: readonly CurveSeg[], splits: number[][], end: Pt): void {
  segs.forEach((e, k) => {
    const t = projectPt(e, end);
    if (t !== null) splits[k].push(t);
  });
}

function cutSegAt(e: CurveSeg, raw: readonly number[]): CurveSeg[] {
  const sorted = [...raw].sort((a, b) => a - b);
  const ts = sorted.filter((t, i) => i === 0 || t - sorted[i - 1] > T_EPS);
  if (ts.length === 0) return [e];
  if (e.line) {
    const all = [0, ...ts, 1];
    return all.slice(0, -1).map((t0, k) => {
      const a = lerp(e.c[0], e.c[3], t0), b = lerp(e.c[0], e.c[3], all[k + 1]);
      return { c: [a, a, b, b], line: true };
    });
  }
  const out: CurveSeg[] = [];
  let rem = e.c, prev = 0;
  for (const t of ts) {
    const [l, r] = splitCubic4(rem, (t - prev) / (1 - prev));
    out.push({ c: l, line: false });
    rem = r;
    prev = t;
  }
  out.push({ c: rem, line: false });
  return out;
}

function snapVert(verts: Pt[], p: Pt): number {
  const idx = verts.findIndex((v) => dist(v, p) < SNAP);
  if (idx >= 0) return idx;
  verts.push({ x: p.x, y: p.y });
  return verts.length - 1;
}

function nonLoopPieces(pieces: readonly CurveSeg[]): CurveSeg[] {
  return pieces.flatMap((e) => {
    if (dist(e.c[0], e.c[3]) >= SNAP) return [e];
    if (cSpan(e.c) < SNAP) return [];
    const [l, r] = splitCubic4(e.c, 0.5);
    return [{ c: l, line: e.line }, { c: r, line: e.line }];
  });
}

export function splitArrangement(segs: readonly CurveSeg[]): GraphEdge[] {
  const splits = collectSplits(segs);
  const pieces = nonLoopPieces(segs.flatMap((e, i) => cutSegAt(e, splits[i])));
  const verts: Pt[] = [];
  const out: GraphEdge[] = [];
  for (const raw of pieces) {
    const u = snapVert(verts, raw.c[0]), v = snapVert(verts, raw.c[3]);
    if (u === v) continue;
    const a = verts[u], b = verts[v];
    const seg: CurveSeg = raw.line ? { c: [a, a, b, b], line: true } : { c: [a, raw.c[1], raw.c[2], b], line: false };
    const mid = segAt(seg, 0.5);
    const dup = out.some((g) => ((g.u === u && g.v === v) || (g.u === v && g.v === u)) && dist(segAt(g.seg, 0.5), mid) < SNAP);
    if (!dup) out.push({ u, v, seg });
  }
  return out;
}
