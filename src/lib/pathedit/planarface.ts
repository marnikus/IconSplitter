// planarface.ts — planar DCEL cell extraction & boolean cell subtraction
// (2026-11-20, round 7–8): finds the minimal bounded painted cell enclosing `p`
// in the arrangement of ALL subpaths (open curves/lines, crossing lines, and
// overlapping fills, ref image-11 & image-12), pruning dead-end bridges and
// caching the planar decomposition per PathModel for sub-millisecond hover/cut.

import { flattenCycle, polyArea, subtractFaceFromGroup, type OwnerGroup } from "./boolean";
import {
  anySubSegs, hasAnyCrossing, reverseSeg, ringsPaint, segAt, segsWinding, splitArrangement, subToSegs,
  type CurveSeg, type GraphEdge,
} from "./curvecut";
import { cloneModel, type PathModel, type Pt, type SubPath, isAreaRing } from "./model";
import { cutRegion, regionPoints } from "./region";

const TAU = Math.PI * 2;

interface BBox { x0: number; y0: number; x1: number; y1: number }
interface CachedGroup extends OwnerGroup { box: BBox }
interface CachedFace { segs: CurveSeg[]; pts: Pt[]; area: number; box: BBox; sample: Pt; intactSub?: number | null }
interface ModelPlanar { groups: CachedGroup[]; faces: CachedFace[] }

const planarCache = new WeakMap<PathModel, ModelPlanar>();

const halfFrom = (edges: readonly GraphEdge[], h: number): number => ((h & 1) === 0 ? edges[h >> 1].u : edges[h >> 1].v);
const halfTo = (edges: readonly GraphEdge[], h: number): number => ((h & 1) === 0 ? edges[h >> 1].v : edges[h >> 1].u);
const halfSeg = (edges: readonly GraphEdge[], h: number): CurveSeg => ((h & 1) === 0 ? edges[h >> 1].seg : reverseSeg(edges[h >> 1].seg));

const inBox = (b: BBox, p: Pt): boolean => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

function ptsBox(pts: readonly Pt[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

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
    if (cur === h && signedPolyArea(flattenCycle(cycle)) > 1e-5) faces.push(cycle);
  }
  return faces;
}

function buildGroups(m: PathModel): CachedGroup[] {
  const byOwner = new Map<number | undefined, SubPath[]>();
  for (const s of m.subs) {
    if (s.paints === false || !isAreaRing(s)) continue;
    byOwner.set(s.owner, [...(byOwner.get(s.owner) ?? []), s]);
  }
  const out: CachedGroup[] = [];
  for (const [owner, subs] of byOwner) {
    const rule = subs[0].fillRule ?? "nonzero";
    const rings = subs.map(subToSegs).filter((r) => r.length > 0);
    if (rings.length === 0) continue;
    const cPts = rings.flatMap((r) => r.flatMap((e) => e.c));
    out.push({ owner, rule, subs, rings, box: ptsBox(cPts) });
  }
  return out;
}

function faceSample(segs: readonly CurveSeg[]): Pt {
  const e = segs[0], mid = segAt(e, 0.5), a = segAt(e, 0.45), b = segAt(e, 0.55);
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const d = Math.min(1e-3, len * 0.2);
  return { x: mid.x - (dy / len) * d, y: mid.y + (dx / len) * d };
}

function cachedPlanar(m: PathModel): ModelPlanar {
  const hit = planarCache.get(m);
  if (hit !== undefined) return hit;
  const bridgeless = removeBridges(splitArrangement(m.subs.flatMap(anySubSegs)));
  const faces = interiorFaces(bridgeless)
    .map((segs) => { const pts = flattenCycle(segs); return { segs, pts, area: polyArea(pts), box: ptsBox(pts), sample: faceSample(segs) }; })
    .sort((a, b) => a.area - b.area);
  const built: ModelPlanar = { groups: buildGroups(m), faces };
  planarCache.set(m, built);
  return built;
}

function minimalPaintedFace(m: PathModel, p: Pt): { face: CachedFace; islands: CachedFace[]; groups: OwnerGroup[] } | null {
  const planar = cachedPlanar(m);
  const groups = planar.groups.filter((g) => inBox(g.box, p) && ringsPaint(g.rings, g.rule, p));
  if (groups.length === 0) return null;
  const face = planar.faces.find((c) => inBox(c.box, p) && segsWinding(c.segs, p) > 0);
  if (face === undefined) return null;
  const islands = planar.faces.filter(
    (c) => c.area < face.area - 1e-5 && inBox(face.box, c.sample) && segsWinding(face.segs, c.sample) > 0,
  );
  return { face, islands, groups };
}

function findIntactSub(m: PathModel, face: CachedFace, p: Pt): number | null {
  if (face.intactSub !== undefined) return face.intactSub;
  for (let k = 0; k < m.subs.length; k++) {
    const segs = subToSegs(m.subs[k]);
    if (segs.length === 0 || segsWinding(segs, p) === 0) continue;
    if (Math.abs(polyArea(flattenCycle(segs)) - face.area) > Math.max(1e-4, face.area * 1e-3)) continue;
    if (!m.subs.some((s, j) => j !== k && hasAnyCrossing(anySubSegs(s), segs))) {
      face.intactSub = k;
      return k;
    }
  }
  face.intactSub = null;
  return null;
}

function replaceGroupSubs(subs: SubPath[], byOwner: ReadonlyMap<number | undefined, SubPath[]>): SubPath[] {
  const placed = new Set<number | undefined>();
  const out: SubPath[] = [];
  for (const s of subs) {
    const rep = byOwner.get(s.owner);
    if (rep === undefined || s.paints === false || !isAreaRing(s)) {
      out.push(s);
    } else if (!placed.has(s.owner)) {
      placed.add(s.owner);
      out.push(...rep);
    }
  }
  return out;
}

const anyPaintsAt = (groups: readonly OwnerGroup[], q: Pt): boolean =>
  groups.some((g) => ringsPaint(g.rings, g.rule, q));

/** One closed cell of the drawing: its boundary, the cells lying inside it (outermost only) and the uncrossed subpath that IS it, if any. */
export interface Cell { segs: CurveSeg[]; area: number; islands: { segs: CurveSeg[]; sample: Pt }[]; intactSub: number | null }

/** The smallest closed cell holding `p` among ALL lines and fills — painted or not (the Fill tool, 2026-11-27). */
export function cellAt(m: PathModel, p: Pt): Cell | null {
  const faces = cachedPlanar(m).faces;
  const face = faces.find((c) => inBox(c.box, p) && segsWinding(c.segs, p) > 0);
  if (face === undefined) return null;
  const inside = faces.filter((c) => c !== face && c.area < face.area - 1e-5 && inBox(face.box, c.sample) && segsWinding(face.segs, c.sample) > 0);
  const islands = inside.filter((c) => !inside.some((o) => o !== c && o.area > c.area && segsWinding(o.segs, c.sample) > 0));
  return { segs: face.segs, area: face.area, islands: islands.map((c) => ({ segs: c.segs, sample: c.sample })), intactSub: findIntactSub(m, face, p) };
}

/** Flattened polygon of the bounded painted cell holding `p`, or null. */
export function cellHintAt(m: PathModel, p: Pt): Pt[] | null {
  const hit = minimalPaintedFace(m, p);
  if (hit === null) return null;
  const hasBullseye = hit.islands.some((h) => anyPaintsAt(hit.groups, h.sample));
  const sub = hasBullseye ? null : findIntactSub(m, hit.face, p);
  if (sub !== null) return regionPoints(m.subs[sub]);
  return hit.face.pts.length < 3 ? null : hit.face.pts;
}

/** Cuts the bounded painted cell holding `p` out of every object painting at `p`. */
export function cutCellAt(m: PathModel, p: Pt): PathModel | null {
  const hit = minimalPaintedFace(m, p);
  if (hit === null) return null;
  const hasBullseye = hit.islands.some((h) => anyPaintsAt(hit.groups, h.sample));
  const sub = hasBullseye ? null : findIntactSub(m, hit.face, p);
  if (sub !== null) return cutRegion(m, sub, p);
  const islandSegs = hit.islands.map((h) => h.segs);
  const byOwner = new Map<number | undefined, SubPath[]>();
  for (const g of hit.groups) byOwner.set(g.owner, subtractFaceFromGroup(g, hit.face.segs, islandSegs));
  const out = cloneModel(m);
  out.subs = replaceGroupSubs(out.subs, byOwner);
  return out;
}
