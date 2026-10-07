// uparc.ts — the SVG arc→cubic conversion (prompt §5). Owns: the endpoint→
// Ported from arena/d658a5b8 (src/lib/uparc.ts) — the merge report's §3 reason
// for that branch: ONE shared geometry model (parsed paths, transforms and the
// visible bounds with the stroke included) that the export planner, the stroke
// measurement and the local EPS writer all read. Host conventions applied: the
// module name, the imports below, and nothing else.
// centre parameterization (SVG spec F.6.5) and the cubic approximation of an
// elliptical arc segment, so bounds, EPS and rasterization share ONE converter.
// Pure math — no DOM, no state.

import type { Pt } from "./matrix";
import type { PathCommand } from "./path";

/** Everything the endpoint→centre parameterization needs (SVG spec F.6.5). */
export interface ArcParams {
  rx: number;
  ry: number;
  cosP: number;
  sinP: number;
  large: boolean;
  sweep: boolean;
}

/** Appends cubic segments tracing the arc; a zero radii arc is a plain line. */
export function arcToCubic(from: Pt, a: ArcParams, to: Pt, out: PathCommand[]): void {
  if (a.rx === 0 || a.ry === 0 || (from.x === to.x && from.y === to.y)) {
    out.push({ cmd: "L", p: to });
    return;
  }
  const c = arcCenter(from, a, to);
  const g: EllipseGeom = { cx: c.cx, cy: c.cy, rx: c.rx, ry: c.ry, cosP: a.cosP, sinP: a.sinP };
  const n = Math.max(1, Math.ceil(Math.abs(c.dTheta) / (Math.PI / 2)));
  for (let i = 0; i < n; i++) out.push(arcSegment(g, c.theta1 + (c.dTheta * i) / n, c.theta1 + (c.dTheta * (i + 1)) / n));
}

interface EllipseGeom {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  cosP: number;
  sinP: number;
}

function arcCenter(from: Pt, a: ArcParams, to: Pt): { cx: number; cy: number; rx: number; ry: number; theta1: number; dTheta: number } {
  const dx2 = (from.x - to.x) / 2;
  const dy2 = (from.y - to.y) / 2;
  const x1p = a.cosP * dx2 + a.sinP * dy2;
  const y1p = -a.sinP * dx2 + a.cosP * dy2;
  const { rx, ry } = correctedRadii(x1p, y1p, a.rx, a.ry);
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = Math.max(rx * rx * y1p * y1p + ry * ry * x1p * x1p, 1e-12);
  const coef = Math.sqrt(Math.max(0, num / den)) * (a.large !== a.sweep ? 1 : -1);
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const u = { x: (x1p - cxp) / rx, y: (y1p - cyp) / ry };
  const v = { x: (-x1p - cxp) / rx, y: (-y1p - cyp) / ry };
  return {
    cx: a.cosP * cxp - a.sinP * cyp + (from.x + to.x) / 2,
    cy: a.sinP * cxp + a.cosP * cyp + (from.y + to.y) / 2,
    rx, ry,
    theta1: Math.atan2(u.y, u.x),
    dTheta: deltaTheta(u, v, a.sweep),
  };
}

function correctedRadii(x1p: number, y1p: number, rx: number, ry: number): { rx: number; ry: number } {
  const ratio = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (ratio <= 1) return { rx, ry };
  const s = Math.sqrt(ratio);
  return { rx: rx * s, ry: ry * s };
}

function deltaTheta(u: Pt, v: Pt, sweep: boolean): number {
  const dot = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
  let theta = Math.acos(dot) * (u.x * v.y - u.y * v.x >= 0 ? 1 : -1);
  if (!sweep && theta > 0) theta -= 2 * Math.PI;
  if (sweep && theta < 0) theta += 2 * Math.PI;
  return theta;
}

function ellipseAt(g: EllipseGeom, t: number): Pt {
  const lx = g.rx * Math.cos(t);
  const ly = g.ry * Math.sin(t);
  return { x: g.cx + g.cosP * lx - g.sinP * ly, y: g.cy + g.sinP * lx + g.cosP * ly };
}

function ellipseTangent(g: EllipseGeom, t: number): Pt {
  const lx = -g.rx * Math.sin(t);
  const ly = g.ry * Math.cos(t);
  return { x: g.cosP * lx - g.sinP * ly, y: g.sinP * lx + g.cosP * ly };
}

function arcSegment(g: EllipseGeom, t0: number, t1: number): PathCommand {
  const k = (4 / 3) * Math.tan((t1 - t0) / 4);
  const p0 = ellipseAt(g, t0);
  const p1 = ellipseAt(g, t1);
  const d0 = ellipseTangent(g, t0);
  const d1 = ellipseTangent(g, t1);
  return { cmd: "C", c1: { x: p0.x + k * d0.x, y: p0.y + k * d0.y }, c2: { x: p1.x - k * d1.x, y: p1.y - k * d1.y }, p: p1 };
}
