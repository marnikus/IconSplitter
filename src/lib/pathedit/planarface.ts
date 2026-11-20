// planarface.ts — planar DCEL cell extraction & boolean cell subtraction
// (2026-11-20, round 7): finds the minimal bounded painted cell enclosing `p`
// in the arrangement of ALL subpaths (open curves/lines, crossing lines, and
// overlapping fills, ref image-11), pruning dead-end bridges so open tails and
// unclosed spurs never cut unless they close off a real bounded cell.

import { flattenCycle, paintingGroupsAt, polyArea, subtractFaceFromGroup, type OwnerGroup } from "./boolean";
import { anySubSegs, hasAnyCrossing, reverseSeg, segAt, segsWinding, splitArrangement, subToSegs, type CurveSeg, type GraphEdge } from "./curvecut";
import { cloneModel, type PathModel, type Pt, type SubPath } from "./model";
import { cutRegion, regionAt, regionPoints } from "./region";

const TAU = Math.PI * 2;

const halfFrom = (edges: readonly GraphEdge[], h: number): number => ((h & 1) === 0 ? edges[h >> 1].u : edges[h >> 1].v);
const halfTo = (edges: readonly GraphEdge[], h: number): number => ((h & 1) === 0 ? edges[h >> 1].v : edges[h >> 1].u);
const halfSeg = (edges: readonly GraphEdge[], h: number): CurveSeg => ((h & 1) === 0 ? edges[h >> 1].seg : reverseSeg(edges[h >> 1].seg));

function departAngle(seg: CurveSeg, sampleT: number): number {
  const a = seg.c[0], p = segAt(seg, sampleT), f = seg.c[3];
  const dx = p.x - a.x, dy = p.y - a.y;
  return Math.hypot(dx, dy) > 1e-7 ? Math.atan2(dy, dx) : Math.atan2(f.y - a.y, f.x - a.x);
}

function cwTurn(back: number, out: number): number {
  const d = ((back - out) % TAU + TAU) % TAU;
  return d < 1e-7 ? TAU : d;
}

function betterTurn(edges: readonly GraphEdge[], best: number, cand: number, backs: [number, number]): number {
  const tb = cwTurn(backs[0], departAngle(halfSeg(edges, best), 0.02));
  const tc = cwTurn(backs[0], departAngle(halfSeg(edges, cand), 0.02));
  if (Math.abs(tc - tb) > 1e-5) return tc < tb ? cand : best;
  const tb2 = cwTurn(backs[1], departAngle(halfSeg(edges, best), 0.12));
  const tc2 = cwTurn(backs[1], departAngle(halfSeg(edges, cand), 0.12));
  return tc2 < tb2 ? cand : best;
}

function nextHalfEdge(edges: readonly GraphEdge[], outAt: ReadonlyMap<number, number[]>, h: number): number {
  const cands = outAt.get(halfTo(edges, h)) ?? [];
  if (cands.length <= 1) return cands[0] ?? -1;
  const twin = h ^ 1;
  const others = cands.filter((k) => k !== twin);
  if (others.length <= 1) return others[0] ?? twin;
  const twinSeg = halfSeg(edges, twin);
  const backs: [number, number] = [departAngle(twinSeg, 0.02), departAngle(twinSeg, 0.12)];
  return others.reduce((best, k) => betterTurn(edges, best, k, backs));
}

function buildOutMap(edges: readonly GraphEdge[]): Map<number, number[]> {
  const outAt = new Map<number, number[]>();
  for (let h = 0; h < edges.length * 2; h++) {
    const u = halfFrom(edges, h);
    outAt.set(u, [...(outAt.get(u) ?? []), h]);
  }
  return outAt;
}

/** Strips every cut-edge (bridge / open tail / unclosed spur) in one planar-dual pass. */
function removeBridges(edges: readonly GraphEdge[]): GraphEdge[] {
  const outAt = buildOutMap(edges);
  const faceOf = new Int32Array(edges.length * 2).fill(-1);
  let faceId = 0;
  for (let h = 0; h < edges.length * 2; h++) {
    if (faceOf[h] !== -1) continue;
    for (let cur = h; cur >= 0 && faceOf[cur] === -1; cur = nextHalfEdge(edges, outAt, cur)) faceOf[cur] = faceId;
    faceId++;
  }
  return edges.filter((_, i) => faceOf[2 * i] !== faceOf[2 * i + 1]);
}

function signedPolyArea(poly: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) sum += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return sum / 2;
}

function interiorFaces(bridgeless: readonly GraphEdge[]): CurveSeg[][] {
  const outAt = buildOutMap(bridgeless);
  const seen = new Uint8Array(bridgeless.length * 2);
  const faces: CurveSeg[][] = [];
  for (let h = 0; h < bridgeless.length * 2; h++) {
    if (seen[h] !== 0) continue;
    const cycle: CurveSeg[] = [];
    let cur = h;
    while (cur >= 0 && seen[cur] === 0) {
      seen[cur] = 1;
      cycle.push(halfSeg(bridgeless, cur));
      cur = nextHalfEdge(bridgeless, outAt, cur);
    }
    if (cur === h && signedPolyArea(flattenCycle(cycle)) > 1e-2) faces.push(cycle);
  }
  return faces;
}

interface CachedFace { segs: CurveSeg[]; pts: Pt[]; area: number }
const faceCache = new WeakMap<PathModel, CachedFace[]>();

function cachedFaces(m: PathModel): CachedFace[] {
  const hit = faceCache.get(m);
  if (hit !== undefined) return hit;
  const bridgeless = removeBridges(splitArrangement(m.subs.flatMap(anySubSegs)));
  const built = interiorFaces(bridgeless)
    .map((segs) => { const pts = flattenCycle(segs); return { segs, pts, area: polyArea(pts) }; })
    .sort((a, b) => a.area - b.area);
  faceCache.set(m, built);
  return built;
}

function minimalPaintedFace(m: PathModel, p: Pt): { face: CachedFace; groups: OwnerGroup[] } | null {
  const groups = paintingGroupsAt(m, p);
  if (groups.length === 0) return null;
  const face = cachedFaces(m).find((c) => segsWinding(c.segs, p) > 0);
  return face === undefined ? null : { face, groups };
}

function isIntactClosedSub(m: PathModel, sub: number | null, faceArea: number): sub is number {
  if (sub === null) return false;
  const segs = subToSegs(m.subs[sub]);
  if (segs.length === 0 || Math.abs(polyArea(flattenCycle(segs)) - faceArea) > 0.1) return false;
  return !m.subs.some((s, j) => j !== sub && hasAnyCrossing(anySubSegs(s), segs));
}

function replaceGroupSubs(subs: SubPath[], byOwner: ReadonlyMap<number | undefined, SubPath[]>): SubPath[] {
  const placed = new Set<number | undefined>();
  const out: SubPath[] = [];
  for (const s of subs) {
    const rep = byOwner.get(s.owner);
    if (rep === undefined || s.paints === false || !s.closed || s.anchors.length < 3) {
      out.push(s);
    } else if (!placed.has(s.owner)) {
      placed.add(s.owner);
      out.push(...rep);
    }
  }
  return out;
}

/** Flattened polygon of the bounded painted cell holding `p`, or null. */
export function cellHintAt(m: PathModel, p: Pt): Pt[] | null {
  const hit = minimalPaintedFace(m, p);
  if (hit === null) return null;
  const sub = regionAt(m, p);
  if (isIntactClosedSub(m, sub, hit.face.area)) return regionPoints(m.subs[sub]);
  return hit.face.pts.length < 3 ? null : hit.face.pts;
}

/** Cuts the bounded painted cell holding `p` out of every object painting at `p`. */
export function cutCellAt(m: PathModel, p: Pt): PathModel | null {
  const hit = minimalPaintedFace(m, p);
  if (hit === null) return null;
  const sub = regionAt(m, p);
  if (isIntactClosedSub(m, sub, hit.face.area)) return cutRegion(m, sub, p);
  const byOwner = new Map<number | undefined, SubPath[]>();
  for (const g of hit.groups) byOwner.set(g.owner, subtractFaceFromGroup(g, hit.face.segs));
  const out = cloneModel(m);
  out.subs = replaceGroupSubs(out.subs, byOwner);
  return out;
}
