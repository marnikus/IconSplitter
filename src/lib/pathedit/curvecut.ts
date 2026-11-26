// curvecut.ts — exact cubic-Bezier / line arrangement & ray-winding primitives
// for boolean region cuts (2026-11-20): splits closed subpaths at every curve
// crossing and shared-edge transition while keeping true cubic handles intact.

import { assembleGraph, type PtLink } from "./curvegraph";
import { cubicAt, isLineSegment, segmentCubic, splitCubic, type Pt, type SubPath, isAreaRing } from "./model";

export type Cubic = [Pt, Pt, Pt, Pt];
export interface CurveSeg { c: Cubic; line: boolean }
export interface GraphEdge { u: number; v: number; seg: CurveSeg }

export const splitCubic4 = (c: Cubic, t: number): [Cubic, Cubic] => splitCubic(c, t) as [Cubic, Cubic];

interface Chord { seg: number; t0: number; t1: number; a: Pt; b: Pt; x0: number; y0: number; x1: number; y1: number }

const CHORDS = 24;
const EPS = 1e-9;
const T_EPS = 1e-7;
const SNAP = 1.2e-2;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export const segAt = (e: CurveSeg, t: number): Pt => (e.line ? lerp(e.c[0], e.c[3], t) : cubicAt(e.c, t));

export const reverseSeg = (e: CurveSeg): CurveSeg => ({ c: [e.c[3], e.c[2], e.c[1], e.c[0]], line: e.line });

function segsUpTo(s: SubPath, limit: number): CurveSeg[] {
  const out: CurveSeg[] = [];
  for (let i = 0; i < limit; i++) {
    const c = segmentCubic(s, i);
    if (c !== null && cSpan(c) > 1e-6) out.push({ c, line: isLineSegment(s, i) });
  }
  return out;
}

export const subToSegs = (s: SubPath): CurveSeg[] =>
  isAreaRing(s) ? segsUpTo(s, s.anchors.length) : [];

export const anySubSegs = (s: SubPath): CurveSeg[] =>
  s.closed ? subToSegs(s) : s.anchors.length >= 2 ? segsUpTo(s, s.anchors.length - 1) : [];

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

const awayFromEnds = (e: CurveSeg, q: Pt): boolean => dist(q, e.c[0]) >= SNAP * 2 && dist(q, e.c[3]) >= SNAP * 2;

function projectLinePt(e: CurveSeg, p: Pt): number | null {
  if (!cubicNearBox(e.c, p, SNAP * 2)) return null;
  const dx = e.c[3].x - e.c[0].x, dy = e.c[3].y - e.c[0].y, len2 = dx * dx + dy * dy;
  if (len2 < EPS) return null;
  const t = ((p.x - e.c[0].x) * dx + (p.y - e.c[0].y) * dy) / len2;
  if (t <= T_EPS || t >= 1 - T_EPS) return null;
  const q = segAt(e, t);
  return dist(q, p) < SNAP && awayFromEnds(e, q) ? t : null;
}

export function cubicNearBox(c: Cubic, p: Pt, pad: number): boolean {
  return p.x >= Math.min(c[0].x, c[1].x, c[2].x, c[3].x) - pad && p.x <= Math.max(c[0].x, c[1].x, c[2].x, c[3].x) + pad
    && p.y >= Math.min(c[0].y, c[1].y, c[2].y, c[3].y) - pad && p.y <= Math.max(c[0].y, c[1].y, c[2].y, c[3].y) + pad;
}

function coarseCubicT(c: Cubic, p: Pt): [number, number] {
  let best = 0.5, bestD = Infinity;
  for (let k = 0; k <= CHORDS; k++) {
    const d = dist(cubicAt(c, k / CHORDS), p);
    if (d < bestD) { bestD = d; best = k / CHORDS; }
  }
  return [best, bestD];
}

function projectCubicPt(e: CurveSeg, p: Pt): number | null {
  if (!cubicNearBox(e.c, p, SNAP * 2)) return null;
  const [seed, bestD] = coarseCubicT(e.c, p);
  if (bestD > cSpan(e.c) * 0.25 + SNAP * 4) return null;
  let best = seed;
  for (let k = 0; k < 6; k++) {
    const q = cubicAt(e.c, best), d = segDeriv(e, best), den = d.x * d.x + d.y * d.y;
    if (den < EPS) break;
    best = Math.max(0, Math.min(1, best - ((q.x - p.x) * d.x + (q.y - p.y) * d.y) / den));
  }
  const q = cubicAt(e.c, best);
  return best > T_EPS && best < 1 - T_EPS && dist(q, p) < SNAP && awayFromEnds(e, q) ? best : null;
}

const projectPt = (e: CurveSeg, p: Pt): number | null => (e.line ? projectLinePt(e, p) : projectCubicPt(e, p));

interface SegBox { x0: number; y0: number; x1: number; y1: number }

const segBox = (e: CurveSeg): SegBox => ({
  x0: Math.min(e.c[0].x, e.c[1].x, e.c[2].x, e.c[3].x), x1: Math.max(e.c[0].x, e.c[1].x, e.c[2].x, e.c[3].x),
  y0: Math.min(e.c[0].y, e.c[1].y, e.c[2].y, e.c[3].y), y1: Math.max(e.c[0].y, e.c[1].y, e.c[2].y, e.c[3].y),
});

const boxesApart = (a: SegBox, b: SegBox): boolean =>
  b.x1 < a.x0 - SNAP || b.x0 > a.x1 + SNAP || b.y1 < a.y0 - SNAP || b.y0 > a.y1 + SNAP;

export function hasAnyCrossing(a: readonly CurveSeg[], b: readonly CurveSeg[]): boolean {
  const ba = a.map(segBox), bb = b.map(segBox);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (boxesApart(ba[i], bb[j])) continue;
      const ca = chordsOf(a[i], i), cb = chordsOf(b[j], j);
      if (ca.some((p) => cb.some((q) => meetChords(p, q) !== null))) return true;
    }
  }
  const endsA = a.flatMap((e) => [e.c[0], e.c[3]]), endsB = b.flatMap((e) => [e.c[0], e.c[3]]);
  if (endsA.some((pa) => endsB.some((pb) => dist(pa, pb) < SNAP))) return true;
  return endsA.some((p) => b.some((e) => projectPt(e, p) !== null))
    || endsB.some((p) => a.some((e) => projectPt(e, p) !== null));
}

const sameDirSeg = (a: CurveSeg, b: CurveSeg): boolean =>
  dist(a.c[0], b.c[0]) < SNAP && dist(a.c[3], b.c[3]) < SNAP
  && dist(segAt(a, 0.33), segAt(b, 0.33)) < SNAP && dist(segAt(a, 0.67), segAt(b, 0.67)) < SNAP;

const onSeg = (e: CurveSeg, p: Pt): boolean =>
  dist(e.c[0], p) < SNAP * 2 || dist(e.c[3], p) < SNAP * 2 || projectPt(e, p) !== null;

function coincidentHit(a: CurveSeg, b: CurveSeg, ti: number, tj: number): boolean {
  if (dist(segAt(a, ti), segAt(b, tj)) >= SNAP) return true;
  const da = segDeriv(a, ti), db = segDeriv(b, tj);
  const scale = Math.hypot(da.x, da.y) * Math.hypot(db.x, db.y);
  if (scale > EPS && Math.abs(da.x * db.y - da.y * db.x) > 0.025 * scale) return false;
  return onSeg(b, segAt(a, Math.max(0, ti - 0.08))) && onSeg(b, segAt(a, Math.min(1, ti + 0.08)));
}

function matchDupSeg(e: CurveSeg, b: SegBox, segs: readonly CurveSeg[], boxes: readonly SegBox[]): [PtLink, PtLink] | null {
  for (let i = 0; i < segs.length; i++) {
    if (boxesApart(b, boxes[i])) continue;
    if (sameDirSeg(e, segs[i])) return [[e.c[0], segs[i].c[0]], [e.c[3], segs[i].c[3]]];
    if (sameDirSeg(e, reverseSeg(segs[i]))) return [[e.c[0], segs[i].c[3]], [e.c[3], segs[i].c[0]]];
  }
  return null;
}

function dedupSegs(rawSegs: readonly CurveSeg[]): { segs: CurveSeg[]; boxes: SegBox[]; links: PtLink[] } {
  const segs: CurveSeg[] = [], boxes: SegBox[] = [], links: PtLink[] = [];
  for (const e of rawSegs) {
    const b = segBox(e);
    const hit = matchDupSeg(e, b, segs, boxes);
    if (hit !== null) links.push(hit[0], hit[1]);
    else { segs.push(e); boxes.push(b); }
  }
  return { segs, boxes, links };
}

const inBoxPad = (b: SegBox, p: Pt, pad: number): boolean =>
  p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.y >= b.y0 - pad && p.y <= b.y1 + pad;

function projectEnd(segs: readonly CurveSeg[], boxes: readonly SegBox[], splits: number[][], end: Pt): void {
  for (let k = 0; k < segs.length; k++) {
    if (!inBoxPad(boxes[k], end, SNAP * 2)) continue;
    const t = projectPt(segs[k], end);
    if (t !== null) splits[k].push(t);
  }
}

function collectSplits(segs: readonly CurveSeg[], boxes: readonly SegBox[]): number[][] {
  const splits = segs.map(() => [] as number[]);
  const chords = segs.map((e, i) => chordsOf(e, i));
  const ends: Pt[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) if (!boxesApart(boxes[i], boxes[j])) crossPair(segs, chords, splits, [i, j]);
    for (const end of [segs[i].c[0], segs[i].c[3]]) snapVert(ends, end);
  }
  for (const end of ends) projectEnd(segs, boxes, splits, end);
  return splits;
}

function crossPair(segs: readonly CurveSeg[], chords: Chord[][], splits: number[][], [i, j]: [number, number]): void {
  for (const p of chords[i]) {
    for (const q of chords[j]) {
      const hit = meetChords(p, q);
      if (hit === null) continue;
      const [ti, tj] = refinePair(segs[i], segs[j], hit[0], hit[1]);
      if (coincidentHit(segs[i], segs[j], ti, tj)) continue;
      if (ti > T_EPS && ti < 1 - T_EPS) splits[i].push(ti);
      if (tj > T_EPS && tj < 1 - T_EPS) splits[j].push(tj);
    }
  }
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

export function splitArrangement(rawSegs: readonly CurveSeg[]): GraphEdge[] {
  const { segs, boxes, links } = dedupSegs(rawSegs);
  const splits = collectSplits(segs, boxes);
  const pieces = segs.flatMap((e, i) => cutSegAt(e, splits[i]));
  return assembleGraph(pieces, links, SNAP);
}
