// boolean.ts — exact cubic-Bezier boolean difference & intersection for
// partially overlapping region cuts (2026-11-20, round 6): when a cutter ring
// crosses out of a filled shape (ref image-9), only Fill \ Cutter remains and
// only Fill ∩ Cutter is highlighted — never inverting the outside crescent.

import {
  cubicNearBox, hasAnyCrossing, reverseSeg, ringsPaint, segAt, segsWinding, splitArrangement, splitCubic4, subToSegs,
  type CurveSeg, type GraphEdge,
} from "./curvecut";
import { modeOf, type Anchor, type PathModel, type Pt, type SubPath } from "./model";

const TAU = Math.PI * 2;
const HINT_STEPS = 20;

export interface OwnerGroup { owner: number | undefined; rule: "evenodd" | "nonzero"; subs: SubPath[]; rings: CurveSeg[][] }

function edgeMidNormal(e: CurveSeg): { mid: Pt; nIn: Pt } {
  const [l, r] = splitCubic4(e.c, 0.5);
  const mid = e.line ? segAt(e, 0.5) : l[3];
  let dx = e.line ? e.c[3].x - e.c[0].x : r[1].x - l[2].x;
  let dy = e.line ? e.c[3].y - e.c[0].y : r[1].y - l[2].y;
  if (Math.hypot(dx, dy) < 1e-7) {
    const a = segAt(e, 0.48), b = segAt(e, 0.52);
    dx = b.x - a.x; dy = b.y - a.y;
  }
  const len = Math.hypot(dx, dy) || 1;
  return { mid, nIn: { x: -dy / len, y: dx / len } };
}

function ptChordDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function probeOffset(edges: readonly GraphEdge[], idx: number, mid: Pt): number {
  const c = edges[idx].seg.c;
  const span = Math.max(1e-4, Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y));
  let near = Math.max(0.2, span * 0.25);
  edges.forEach((g, j) => {
    if (j === idx || !cubicNearBox(g.seg.c, mid, near)) return;
    const steps = g.seg.line ? 1 : 16;
    let prev = g.seg.c[0];
    for (let k = 1; k <= steps; k++) {
      const next = segAt(g.seg, k / steps);
      near = Math.min(near, ptChordDist(mid, prev, next));
      prev = next;
    }
  });
  return Math.max(1e-6, Math.min(0.05, 0.2 * span, 0.25 * near));
}

function directedBoundary(edges: readonly GraphEdge[], keep: (p: Pt) => boolean): GraphEdge[] {
  const out: GraphEdge[] = [];
  edges.forEach((e, i) => {
    const { mid, nIn } = edgeMidNormal(e.seg);
    const d = probeOffset(edges, i, mid);
    const inL = keep({ x: mid.x + nIn.x * d, y: mid.y + nIn.y * d });
    const inR = keep({ x: mid.x - nIn.x * d, y: mid.y - nIn.y * d });
    if (inL !== inR) out.push(inL ? e : { u: e.v, v: e.u, seg: reverseSeg(e.seg) });
  });
  return out;
}

function rayAngle(a: Pt, b: Pt, fallback: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.hypot(dx, dy) > 1e-6 ? Math.atan2(dy, dx) : Math.atan2(fallback.y - a.y, fallback.x - a.x);
}

const cwTurn = (back: number, out: number): number => {
  const d = ((back - out) % TAU + TAU) % TAU;
  return d < 1e-7 ? TAU : d;
};

function pickNextEdge(directed: readonly GraphEdge[], cands: readonly number[], used: Uint8Array, incoming: CurveSeg): number {
  const free = cands.filter((k) => used[k] === 0);
  if (free.length <= 1) return free[0] ?? -1;
  const back = rayAngle(incoming.c[3], segAt(incoming, 0.98), incoming.c[0]);
  return free.reduce((best, k) => {
    const sb = directed[best].seg, sk = directed[k].seg;
    const tBest = cwTurn(back, rayAngle(sb.c[0], segAt(sb, 0.02), sb.c[3]));
    const tCand = cwTurn(back, rayAngle(sk.c[0], segAt(sk, 0.02), sk.c[3]));
    if (Math.abs(tCand - tBest) > 1e-5) return tCand < tBest ? k : best;
    return cwTurn(back, rayAngle(sk.c[0], segAt(sk, 0.15), sk.c[3])) < cwTurn(back, rayAngle(sb.c[0], segAt(sb, 0.15), sb.c[3])) ? k : best;
  });
}

function traceCycles(directed: readonly GraphEdge[]): CurveSeg[][] {
  const byU = new Map<number, number[]>();
  directed.forEach((e, i) => byU.set(e.u, [...(byU.get(e.u) ?? []), i]));
  const used = new Uint8Array(directed.length);
  const cycles: CurveSeg[][] = [];
  for (let i = 0; i < directed.length; i++) {
    if (used[i] !== 0) continue;
    const cycle = walkOneCycle(directed, byU, used, i);
    if (cycle !== null) cycles.push(cycle);
  }
  return cycles;
}

function walkOneCycle(directed: readonly GraphEdge[], byU: ReadonlyMap<number, number[]>, used: Uint8Array, start: number): CurveSeg[] | null {
  const startVert = directed[start].u;
  const cycle: CurveSeg[] = [];
  let cur = start;
  while (cur >= 0 && used[cur] === 0) {
    used[cur] = 1;
    cycle.push(directed[cur].seg);
    const v = directed[cur].v;
    if (v === startVert) return cycle;
    cur = pickNextEdge(directed, byU.get(v) ?? [], used, directed[cur].seg);
  }
  return null;
}

function splitHalf(e: CurveSeg): [CurveSeg, CurveSeg] {
  if (e.line) {
    const m = segAt(e, 0.5);
    return [{ c: [e.c[0], e.c[0], m, m], line: true }, { c: [m, m, e.c[3], e.c[3]], line: true }];
  }
  const [l, r] = splitCubic4(e.c, 0.5);
  return [{ c: l, line: false }, { c: r, line: false }];
}

function ensureThreeSegs(cycle: readonly CurveSeg[]): CurveSeg[] {
  const out = [...cycle];
  while (out.length > 0 && out.length < 3) {
    let best = 0, bestLen = -1;
    out.forEach((e, i) => {
      const len = Math.hypot(e.c[3].x - e.c[0].x, e.c[3].y - e.c[0].y);
      if (len > bestLen) { bestLen = len; best = i; }
    });
    out.splice(best, 1, ...splitHalf(out[best]));
  }
  return out;
}

export function flattenCycle(segs: readonly CurveSeg[]): Pt[] {
  const pts: Pt[] = [];
  for (const e of segs) {
    const n = e.line ? 1 : HINT_STEPS;
    for (let k = 0; k < n; k++) pts.push(segAt(e, k / n));
  }
  return pts;
}

export function polyArea(poly: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) sum += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return Math.abs(sum) / 2;
}

function segsToSubPath(cycle: readonly CurveSeg[], style: Pick<SubPath, "owner" | "fillRule">): SubPath | null {
  const segs = ensureThreeSegs(cycle);
  if (segs.length < 3 || polyArea(flattenCycle(segs)) < 1e-5) return null;
  const anchors: Anchor[] = segs.map((curr, i) => {
    const prev = segs[(i - 1 + segs.length) % segs.length];
    const a: Anchor = {
      x: curr.c[0].x, y: curr.c[0].y,
      in: prev.line ? null : { ...prev.c[2] },
      out: curr.line ? null : { ...curr.c[1] },
      mode: "corner",
    };
    a.mode = modeOf(a);
    return a;
  });
  return { anchors, closed: true, paints: true, ...style };
}

function strictlyInside(ringsA: readonly (readonly CurveSeg[])[], rule: "evenodd" | "nonzero", segB: readonly CurveSeg[]): boolean {
  if (ringsA.some((r) => hasAnyCrossing(r, segB))) return false;
  return segB.every((e) => [0.15, 0.5, 0.85].every((t) => ringsPaint(ringsA, rule, segAt(e, t))));
}

/**
 * Null when `cutter` is an uncrossed ring of `owner` itself or sits strictly
 * inside `(ownerSubs, rule)` without crossing any edge (the intact-ring
 * knock-out is already exact); otherwise the exact cubic-Bezier closed subpaths
 * of `OwnerLayer \ Cutter`.
 */
export function clipLayerIfPartial(
  m: PathModel,
  owner: number | undefined,
  rule: "evenodd" | "nonzero",
  cut: { sub: number; dropped: ReadonlySet<number> },
): SubPath[] | null {
  const cutter = m.subs[cut.sub];
  const segB = cutter === undefined ? [] : subToSegs(cutter);
  const ownerSubs = m.subs.filter((s, i) => !cut.dropped.has(i) && s.owner === owner && s.paints !== false && s.closed && s.anchors.length >= 3);
  const ringsA = ownerSubs.map(subToSegs).filter((r) => r.length > 0);
  if (segB.length === 0 || ringsA.length === 0 || unclippedRing(cutter, owner, ownerSubs, segB) || strictlyInside(ringsA, rule, segB)) return null;
  const style: Pick<SubPath, "owner" | "fillRule"> = {
    ...(owner === undefined ? {} : { owner }),
    ...(rule === "evenodd" ? { fillRule: "evenodd" } : {}),
  };
  const edges = splitArrangement([...ringsA.flat(), ...segB]);
  const dir = directedBoundary(edges, (q) => ringsPaint(ringsA, rule, q) && segsWinding(segB, q) === 0);
  return traceCycles(dir).map((c) => segsToSubPath(c, style)).filter((s): s is SubPath => s !== null);
}

function unclippedRing(cutter: SubPath | undefined, owner: number | undefined, ownerSubs: readonly SubPath[], segB: readonly CurveSeg[]): boolean {
  if (cutter === undefined || cutter.paints === false || cutter.owner !== owner) return false;
  return !ownerSubs.some((s) => s !== cutter && hasAnyCrossing(subToSegs(s), segB));
}

export function subtractFaceFromGroup(
  g: OwnerGroup,
  face: readonly CurveSeg[],
  islands: readonly (readonly CurveSeg[])[] = [],
): SubPath[] {
  const style: Pick<SubPath, "owner" | "fillRule"> = {
    ...(g.owner === undefined ? {} : { owner: g.owner }),
    ...(g.rule === "evenodd" ? { fillRule: "evenodd" } : {}),
  };
  const edges = splitArrangement([...g.rings.flat(), ...face, ...islands.flat()]);
  const inCell = (q: Pt): boolean => segsWinding(face, q) !== 0 && !islands.some((h) => segsWinding(h, q) > 0);
  const dir = directedBoundary(edges, (q) => ringsPaint(g.rings, g.rule, q) && !inCell(q));
  return traceCycles(dir).map((c) => segsToSubPath(c, style)).filter((s): s is SubPath => s !== null);
}

export function paintingGroupsAt(m: PathModel, p: Pt): OwnerGroup[] {
  const byOwner = new Map<number | undefined, SubPath[]>();
  for (const s of m.subs) {
    if (s.paints === false || !s.closed || s.anchors.length < 3) continue;
    byOwner.set(s.owner, [...(byOwner.get(s.owner) ?? []), s]);
  }
  const out: OwnerGroup[] = [];
  for (const [owner, subs] of byOwner) {
    const rule = subs[0].fillRule ?? "nonzero";
    const rings = subs.map(subToSegs).filter((r) => r.length > 0);
    if (ringsPaint(rings, rule, p)) out.push({ owner, rule, subs, rings });
  }
  return out;
}

/**
 * The painted part of `m.subs[sub]` holding `p`: its flattened outline (for the
 * red hover mark) and its area (so a partial cutter ranks by its painted bite,
 * not its empty overhang). Null when nothing paints at `p`.
 */
export function clippedRegionAt(m: PathModel, sub: number, p: Pt): { pts: Pt[]; area: number } | null {
  const cutter = m.subs[sub];
  const segB = cutter === undefined ? [] : subToSegs(cutter);
  if (segB.length === 0 || segsWinding(segB, p) === 0) return null;
  const groups = paintingGroupsAt(m, p);
  if (groups.length === 0) return null;
  const anyPaint = (q: Pt): boolean => groups.some((g) => ringsPaint(g.rings, g.rule, q));
  const crossed = groups.some((g) => g.rings.some((r) => hasAnyCrossing(r, segB)));
  const ownRing = cutter.paints !== false && groups.some((g) => g.owner === cutter.owner);
  const allIn = !crossed && (ownRing || segB.every((e) => [0.15, 0.5, 0.85].every((t) => anyPaint(segAt(e, t)))));
  if (allIn) {
    const pts = flattenCycle(segB);
    return { pts, area: polyArea(pts) };
  }
  const edges = splitArrangement([...groups.flatMap((g) => g.rings.flat()), ...segB]);
  const cycles = traceCycles(directedBoundary(edges, (q) => anyPaint(q) && segsWinding(segB, q) !== 0));
  const holding = cycles.filter((c) => segsWinding(c, p) !== 0);
  if (holding.length === 0) return null;
  const outer = holding.reduce((a, b) => (polyArea(flattenCycle(a)) >= polyArea(flattenCycle(b)) ? a : b));
  const pts = flattenCycle(outer);
  return { pts, area: holding.reduce((sum, c) => sum + (segsWinding(c, p) > 0 ? 1 : -1) * polyArea(flattenCycle(c)), 0) };
}
