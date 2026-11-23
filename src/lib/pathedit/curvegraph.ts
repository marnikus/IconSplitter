// curvegraph.ts — topological graph assembly for curve arrangements (2026-11-20):
// contracts near-coincident endpoints and sub-tolerance split fragments via a
// transitive Union-Find before deduplicating parallel twin edges, so closed
// curves never tear into degree-1 dead-end stubs after small object/line moves.

import { splitCubic4, type Cubic, type CurveSeg, type GraphEdge } from "./curvecut";
import { cubicAt, type Pt } from "./model";

export type PtLink = [Pt, Pt];

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const segAt = (e: CurveSeg, t: number): Pt => (e.line ? lerp(e.c[0], e.c[3], t) : cubicAt(e.c, t));

const cSpan = (c: Cubic): number =>
  Math.max(dist(c[0], c[3]), dist(c[0], c[1]), dist(c[0], c[2]), dist(c[1], c[3]), dist(c[2], c[3]));

const revSeg = (e: CurveSeg): CurveSeg => ({ c: [e.c[3], e.c[2], e.c[1], e.c[0]], line: e.line });

interface VertUF {
  pts: Pt[];
  id: (p: Pt) => number;
  root: (x: number) => number;
  unite: (a: number, b: number) => void;
}

function makeVertUF(): VertUF {
  const pts: Pt[] = [], parent: number[] = [], exact = new Map<string, number>();
  const root = (x: number): number => (parent[x] === x ? x : (parent[x] = root(parent[x])));
  const unite = (a: number, b: number): void => { const ra = root(a), rb = root(b); if (ra !== rb) parent[rb] = ra; };
  const id = (p: Pt): number => {
    const key = `${Math.round(p.x * 1e7)},${Math.round(p.y * 1e7)}`;
    const hit = exact.get(key);
    if (hit !== undefined) return hit;
    const idx = pts.length;
    pts.push({ x: p.x, y: p.y });
    parent.push(idx);
    exact.set(key, idx);
    return idx;
  };
  return { pts, id, root, unite };
}

function uniteNearPts(uf: VertUF, snap: number): void {
  const order = uf.pts.map((_, i) => i).sort((a, b) => uf.pts[a].x - uf.pts[b].x);
  for (let i = 0; i < order.length; i++) {
    const a = order[i], pa = uf.pts[a];
    for (let j = i + 1; j < order.length && uf.pts[order[j]].x - pa.x < snap; j++) {
      const b = order[j];
      if (dist(pa, uf.pts[b]) < snap) uf.unite(a, b);
    }
  }
}

function clusterVerts(pieces: readonly CurveSeg[], links: readonly PtLink[], snap: number): VertUF {
  const uf = makeVertUF();
  for (const [a, b] of links) uf.unite(uf.id(a), uf.id(b));
  for (const e of pieces) { uf.id(e.c[0]); uf.id(e.c[3]); }
  uniteNearPts(uf, snap);
  for (const e of pieces) if (cSpan(e.c) < snap) uf.unite(uf.id(e.c[0]), uf.id(e.c[3]));
  return uf;
}

const sameBody = (a: CurveSeg, b: CurveSeg, tol: number): boolean =>
  dist(segAt(a, 0.33), segAt(b, 0.33)) < tol && dist(segAt(a, 0.67), segAt(b, 0.67)) < tol;

const pairKey = (u: number, v: number): number => (u < v ? u * 131072 + v : v * 131072 + u);

function addUniqueEdge(out: GraphEdge[], byPair: Map<number, GraphEdge[]>, edge: GraphEdge, tol: number): void {
  const key = pairKey(edge.u, edge.v);
  const bucket = byPair.get(key);
  const dup = bucket?.some((g) => (g.u === edge.u ? sameBody(edge.seg, g.seg, tol) : sameBody(edge.seg, revSeg(g.seg), tol))) ?? false;
  if (dup) return;
  out.push(edge);
  if (bucket !== undefined) bucket.push(edge);
  else byPair.set(key, [edge]);
}

const pinnedSeg = (raw: CurveSeg, a: Pt, b: Pt): CurveSeg =>
  raw.line ? { c: [a, a, b, b], line: true } : { c: [a, raw.c[1], raw.c[2], b], line: false };

function emitPiece(out: GraphEdge[], byPair: Map<number, GraphEdge[]>, uf: VertUF, ctx: { raw: CurveSeg; snap: number }): void {
  const { raw, snap } = ctx;
  const u = uf.root(uf.id(raw.c[0])), v = uf.root(uf.id(raw.c[3]));
  if (u === v) {
    if (cSpan(raw.c) < snap * 2) return;
    const [l, r] = splitCubic4(raw.c, 0.5);
    const m = uf.root(uf.id(l[3]));
    if (m === u) return;
    addUniqueEdge(out, byPair, { u, v: m, seg: pinnedSeg({ c: l, line: raw.line }, uf.pts[u], uf.pts[m]) }, snap * 2);
    addUniqueEdge(out, byPair, { u: m, v: u, seg: pinnedSeg({ c: r, line: raw.line }, uf.pts[m], uf.pts[u]) }, snap * 2);
    return;
  }
  addUniqueEdge(out, byPair, { u, v, seg: pinnedSeg(raw, uf.pts[u], uf.pts[v]) }, snap * 2);
}

export function assembleGraph(pieces: readonly CurveSeg[], links: readonly PtLink[], snap: number): GraphEdge[] {
  const uf = clusterVerts(pieces, links, snap);
  const out: GraphEdge[] = [], byPair = new Map<number, GraphEdge[]>();
  for (const raw of pieces) emitPiece(out, byPair, uf, { raw, snap });
  return out;
}
