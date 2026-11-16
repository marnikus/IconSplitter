// stretch.ts — Alt + Shift + click on a line (2026-11-09): the STRETCH of a line
// between the two crossings around the click. A crossing is where another line
// (or a far part of the same one) cuts the clicked line or ends on it. Removing
// the stretch makes an anchor on each crossing — the shape is kept, even where
// the line had no anchors — and drops what lies between them: an open line
// splits in two, a closed shape opens. Pure, over the point model.

import { cloneModel, cubicAt, isLineSegment, segmentCubic, type Anchor, type PathModel, type Pt, type SubPath } from "./model";
import { insertOnSegment, openRun } from "./ops";

/**
 * Where along a subpath (segment index + t): `t` is the cubic's parameter on a curve and the plain fraction
 * along a straight segment (a line stored as a cubic would run unevenly). `from` is before the click, `to` after it. On a closed path `to` may be below `from` (the stretch wraps the closing segment). */
export interface Stretch { from: number; to: number }

interface Piece { seg: number; t0: number; t1: number; a: Pt; b: Pt; x0: number; y0: number; x1: number; y1: number }

const STEPS = 32;
const EPS = 1e-9;
const SAME = 1e-6;
const SAMPLES = 12;

const segCount = (s: SubPath): number => (s.closed ? s.anchors.length : s.anchors.length - 1);

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The point at `t` of segment `seg`: even along a straight segment, the cubic's parameter on a curve. */
function pointAt(s: SubPath, seg: number, t: number): Pt | null {
  const c = segmentCubic(s, seg);
  if (c === null) return null;
  return isLineSegment(s, seg) ? lerp(c[0], c[3], t) : cubicAt(c, t);
}

/** A subpath as straight pieces (a curve in STEPS pieces) with the cubic parameter range of each. */
function piecesOf(s: SubPath): Piece[] {
  const out: Piece[] = [];
  for (let seg = 0; seg < segCount(s); seg++) {
    const c = segmentCubic(s, seg);
    if (c === null) continue;
    const n = isLineSegment(s, seg) ? 1 : STEPS;
    let a = c[0];
    for (let k = 0; k < n; k++) {
      const b = k + 1 === n ? c[3] : cubicAt(c, (k + 1) / n);
      out.push({ seg, t0: k / n, t1: (k + 1) / n, a, b, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
      a = b;
    }
  }
  return out;
}

/** Where u→v meets p→q (touching an end counts): the fractions along each, or null. */
function meet(u: Pt, v: Pt, p: Pt, q: Pt): { r: number; w: number } | null {
  const rx = v.x - u.x, ry = v.y - u.y, sx = q.x - p.x, sy = q.y - p.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const r = ((p.x - u.x) * sy - (p.y - u.y) * sx) / den;
  const w = ((p.x - u.x) * ry - (p.y - u.y) * rx) / den;
  return r >= -EPS && r <= 1 + EPS && w >= -EPS && w <= 1 + EPS ? { r, w } : null;
}

const apart = (p: Piece, q: Piece): boolean => q.x1 < p.x0 - EPS || q.x0 > p.x1 + EPS || q.y1 < p.y0 - EPS || q.y0 > p.y1 + EPS;
const paramOf = (p: Piece, f: number): number => p.seg + p.t0 + (p.t1 - p.t0) * f;

/** Every crossing along subpath `sub`, as sorted parameters (a closed path wraps: 0 and its length are one). */
function crossingParams(m: PathModel, sub: number): number[] {
  const s = m.subs[sub];
  const mine = piecesOf(s);
  const others = m.subs.flatMap((o, k) => (k === sub ? [] : piecesOf(o)));
  const found: number[] = [];
  mine.forEach((p, k) => {
    for (const q of others) {
      const hit = apart(p, q) ? null : meet(p.a, p.b, q.a, q.b);
      if (hit !== null) found.push(paramOf(p, hit.r));
    }
    // far parts of the same line; the neighbouring pieces only share a corner
    for (let l = k + 2; l < mine.length; l++) {
      if (s.closed && k === 0 && l === mine.length - 1) continue;
      const hit = apart(p, mine[l]) ? null : meet(p.a, p.b, mine[l].a, mine[l].b);
      if (hit !== null) found.push(paramOf(p, hit.r), paramOf(mine[l], hit.w));
    }
  });
  const n = segCount(s);
  const sorted = found.map((u) => (s.closed && u >= n - SAME ? u - n : u)).sort((a, b) => a - b);
  return sorted.filter((u, i) => i === 0 || u - sorted[i - 1] > SAME);
}

/** The nearest crossing before and after `u0`; on a closed path they wrap round. */
function neighbours(us: number[], u0: number, closed: boolean): { from: number | undefined; to: number | undefined } {
  const before = us.filter((u) => u < u0 - SAME);
  const after = us.filter((u) => u > u0 + SAME);
  const from = before[before.length - 1] ?? (closed ? us[us.length - 1] : undefined);
  const to = after[0] ?? (closed ? us[0] : undefined);
  return { from, to };
}

/** The stretch of subpath `sub` around parameter `u0` (the click), or null when it has no crossing on both sides. */
export function stretchAt(m: PathModel, sub: number, u0: number): Stretch | null {
  const s = m.subs[sub];
  if (s === undefined || s.anchors.length < 2) return null;
  const { from, to } = neighbours(crossingParams(m, sub), u0, s.closed);
  return from === undefined || to === undefined || Math.abs(from - to) <= SAME ? null : { from, to };
}

/** The stretch as points along the line (for the red hint). */
export function stretchPoints(m: PathModel, sub: number, st: Stretch): Pt[] {
  const s = m.subs[sub];
  const n = segCount(s);
  const to = s.closed && st.to <= st.from ? st.to + n : st.to;
  const pts: Pt[] = [];
  for (let u = st.from; u < to - EPS;) {
    const seg = Math.floor(u + EPS);
    const end = Math.min(to, seg + 1);
    for (let k = pts.length === 0 ? 0 : 1; k <= SAMPLES; k++) {
      const p = pointAt(s, seg % n, u - seg + ((end - u) * k) / SAMPLES);
      if (p === null) return pts;
      pts.push(p);
    }
    u = end;
  }
  return pts;
}

type End = { kind: "anchor"; k: number } | { kind: "split"; seg: number; t: number };

/** A parameter as an existing anchor (it sits on one) or a place to split. */
function endOf(s: SubPath, p: number): End {
  const seg = Math.min(Math.floor(p), s.anchors.length - 1);
  const t = p - seg;
  if (t < SAME) return { kind: "anchor", k: seg };
  if (t > 1 - SAME) return { kind: "anchor", k: (seg + 1) % s.anchors.length };
  return { kind: "split", seg, t };
}

const before = (a: { seg: number; t: number }, b: { seg: number; t: number }): boolean => a.seg < b.seg || (a.seg === b.seg && a.t < b.t);

/** An anchor on a straight segment at the fraction `t`: the line keeps its shape. */
function splitLine(m: PathModel, sub: number, seg: number, t: number): PathModel | null {
  const out = cloneModel(m);
  const s = out.subs[sub];
  const c = segmentCubic(s, seg);
  if (c === null) return null;
  const p = lerp(c[0], c[3], t);
  const added: Anchor = { x: p.x, y: p.y, in: null, out: null, mode: "corner" };
  s.anchors.splice(seg + 1, 0, added);
  return out;
}

/** An anchor on segment `seg` at `t`, the drawn shape unchanged. */
function splitSegment(m: PathModel, sub: number, seg: number, t: number): PathModel | null {
  const s = m.subs[sub];
  if (isLineSegment(s, seg)) return splitLine(m, sub, seg, t);
  return insertOnSegment(m, sub, seg, t)?.model ?? null;
}

/** Splits at every place (highest first, so earlier numbers hold); returns the model and where each end ended up. */
function splitAt(m: PathModel, sub: number, ends: [End, End]): { model: PathModel; at: [number, number] } | null {
  const splits = ends.filter((e): e is Extract<End, { kind: "split" }> => e.kind === "split").sort((a, b) => (before(a, b) ? 1 : -1));
  let model = m;
  let last: { seg: number; t: number } | null = null;
  for (const sp of splits) {
    // a split above in the same segment left only [0, its t] of it: re-scale
    const next = splitSegment(model, sub, sp.seg, last !== null && last.seg === sp.seg ? sp.t / last.t : sp.t);
    if (next === null) return null;
    model = next;
    last = sp;
  }
  const index = (e: End): number => (e.kind === "anchor"
    ? e.k + splits.filter((x) => x.seg < e.k).length
    : e.seg + 1 + splits.filter((x) => before(x, e)).length);
  return { model, at: [index(ends[0]), index(ends[1])] };
}

/** Everything of a subpath except the run between anchors `iA` → `iB` (forward): one or two open pieces. */
function withoutRange(s: SubPath, iA: number, iB: number): SubPath[] | null {
  const a = s.anchors;
  let runs: SubPath["anchors"][];
  if (s.closed) {
    const arc = [];
    for (let k = iB; ; k = (k + 1) % a.length) { arc.push(a[k]); if (k === iA) break; }
    runs = [arc];
  } else {
    if (iA >= iB) return null;
    runs = [a.slice(0, iA + 1), a.slice(iB)];
  }
  return runs.map((r) => openRun(r, s.owner)).filter((r): r is SubPath => r !== null);
}

/** The model without the stretch; null when it cannot be cut. The given model is never touched. */
export function removeStretch(m: PathModel, sub: number, st: Stretch): PathModel | null {
  const s = m.subs[sub];
  if (s === undefined) return null;
  const split = splitAt(m, sub, [endOf(s, st.from), endOf(s, st.to)]);
  if (split === null) return null;
  const pieces = withoutRange(split.model.subs[sub], split.at[0], split.at[1]);
  if (pieces === null) return null;
  return cloneModel({ subs: split.model.subs.flatMap((x, k) => (k === sub ? pieces : [x])) });
}
