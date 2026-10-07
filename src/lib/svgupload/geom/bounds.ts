// upbounds.ts — the visible-bounds math (prompt §5). Owns: the conservative
// Ported from arena/d658a5b8 (src/lib/upbounds.ts) — the merge report's §3 reason
// for that branch: ONE shared geometry model (parsed paths, transforms and the
// visible bounds with the stroke included) that the export planner, the stroke
// measurement and the local EPS writer all read. Host conventions applied: the
// module name, the imports below, and nothing else.
// bbox of a shape's transformed hull points, the per-miter-joint stroke
// extents (sw/2/sin(θ/2), capped by the miterlimit), and the union rule that
// turns a scene into ONE visible bounds. Policy, documented and tested: caps,
// round/bevel joins and stroke sides are covered by a uniform sw/2 expansion;
// only miter tips extend further, and the whole box is expanded uniformly by
// the worst joint so nothing is ever clipped (a superset, never a crop).

import { applyMatrix, avgScale, type Matrix, type Pt } from "./matrix";
import type { PathCommand } from "./path";
import type { Bounds, GeomScene, GeomShape } from "./scene";

/** The visible bounds of every drawable shape, or null for an empty scene. */
export function sceneBounds(scene: GeomScene): Bounds | null {
  let total: Bounds | null = null;
  for (const shape of scene.shapes) {
    const b = shapeBounds(shape);
    if (b === null) continue;
    total = total === null ? b : unionBounds(total, b);
  }
  return total;
}

/** One shape's visible bounds: transformed hull + uniform stroke expansion. */
export function shapeBounds(shape: GeomShape): Bounds | null {
  if (shape.fill === null && shape.stroke === null) return null; // paints nothing
  const base = pointsBounds(shape.points, shape.matrix);
  if (base === null) return null;
  if (shape.stroke === null) return base;
  const scale = avgScale(shape.matrix);
  const sw = shape.strokeWidth * scale;
  const worst = Math.max(sw / 2, ...shape.miterExtents.map((e) => e * scale));
  return expandBounds(base, worst);
}

/** The bbox of transformed points; null when there is nothing to box. */
export function pointsBounds(points: Pt[], matrix: Matrix): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const raw of points) {
    const p = applyMatrix(matrix, raw);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

export function expandBounds(b: Bounds, by: number): Bounds {
  return { minX: b.minX - by, minY: b.minY - by, maxX: b.maxX + by, maxY: b.maxY + by };
}

/**
 * The stroke extents of every miter joint in a path: half the stroke width
 * over sin(θ/2) — the true miter-tip distance — capped by the miterlimit, the
 * way PostScript and SVG cap it. Arrival/departure tangents come from the
 * normalized commands, curves included; the Z seam is a joint too.
 */
export function jointExtents(commands: PathCommand[], strokeWidth: number, miterlimit: number): number[] {
  const ctx = { half: strokeWidth / 2, miterlimit, out: [] as number[] };
  const s: JointState = { anchor: null, arrive: null, firstOut: null, subStart: null };
  for (const c of commands) {
    if (c.cmd === "M") {
      s.anchor = c.p;
      s.subStart = c.p;
      s.arrive = null;
      s.firstOut = null;
    } else if (c.cmd === "Z") {
      closeJoint(s, ctx);
    } else {
      segmentJoint(s, c, ctx);
    }
  }
  return ctx.out;
}

interface JointState {
  anchor: Pt | null;
  arrive: Pt | null;
  firstOut: Pt | null;
  subStart: Pt | null;
}

interface JointCtx {
  half: number;
  miterlimit: number;
  out: number[];
}

/** One drawing segment: a joint where an arrival meets a departure. */
function segmentJoint(s: JointState, c: Exclude<PathCommand, { cmd: "M" | "Z" }>, ctx: JointCtx): void {
  const from = s.anchor ?? startOf(c);
  const departure = c.cmd === "C" ? sub(c.c1, from) : c.cmd === "Q" ? sub(c.c, from) : sub(c.p, from);
  const arrival = c.cmd === "C" ? sub(c.p, c.c2) : c.cmd === "Q" ? sub(c.p, c.c) : departure;
  if (s.anchor !== null && s.arrive !== null) ctx.out.push(extent(ctx.half, ctx.miterlimit, s.arrive, departure));
  if (s.anchor !== null && s.firstOut === null) s.firstOut = departure;
  s.anchor = c.p;
  s.arrive = arrival;
}

/** The Z seam is a joint too: the closing line meets the first departure. */
function closeJoint(s: JointState, ctx: JointCtx): void {
  if (s.anchor !== null && s.subStart !== null && s.firstOut !== null) {
    ctx.out.push(extent(ctx.half, ctx.miterlimit, sub(s.subStart, s.anchor), s.firstOut));
  }
  s.anchor = null;
  s.arrive = null;
  s.firstOut = null;
}

function startOf(c: Exclude<PathCommand, { cmd: "M" | "Z" }>): Pt {
  return c.cmd === "C" ? c.c1 : c.cmd === "Q" ? c.c : c.p;
}

function extent(half: number, miterlimit: number, arrive: Pt, depart: Pt): number {
  const a = Math.hypot(arrive.x, arrive.y);
  const b = Math.hypot(depart.x, depart.y);
  if (a === 0 || b === 0) return half;
  const cosTheta = (-(arrive.x * depart.x + arrive.y * depart.y)) / (a * b);
  const sinHalf = Math.sqrt(Math.max(0, (1 - cosTheta) / 2));
  if (sinHalf < 1e-6) return half * miterlimit; // a spike reversal: the cap decides
  return Math.min(half / sinHalf, half * miterlimit);
}

function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}
