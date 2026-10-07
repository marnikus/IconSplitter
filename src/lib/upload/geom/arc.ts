// arc.ts — SVG elliptical-arc commands as geometry (RULE 3): the
// endpoint→center conversion (SVG 1.1 §F.6.5), the cardinal extrema inside the
// sweep (bounds), and the end tangents (stroke joins). Shared by lib/upload/geom/path.

import { lineSeg, type Seg } from "./seg";

/** Endpoint→center arc conversion: hull extrema plus end tangents. */
export function arcSeg(from: number[], n: number[], end: number[]): Seg {
  const [x1, y1] = from;
  const [x2, y2] = end;
  const rx = Math.abs(n[0]);
  const ry = Math.abs(n[1]);
  const sweep = n[4];
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
    return lineSeg(from, end);
  }
  const c = arcCenter(from, n, end);
  const hull = [x1, y1, x2, y2, ...arcExtrema(c)];
  const s = sweep === 1 ? 1 : -1;
  return {
    x1, y1, x2, y2, hull,
    ax: s * -(y1 - c.cy), ay: s * (x1 - c.cx),
    bx: s * -(y2 - c.cy), by: s * (x2 - c.cx),
  };
}

export interface ArcCenter { cx: number; cy: number; rx: number; ry: number; phi: number; theta1: number; dTheta: number; scale: number }

/** The center parameterization of an SVG arc (SVG 1.1 §F.6.5).
 *  Exported for the EPS stage, which replays arcs as cubic curves. */
export function arcCenter(from: number[], n: number[], to: number[]): ArcCenter {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const rx = Math.abs(n[0]);
  const ry = Math.abs(n[1]);
  const phi = (n[2] * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const rxs = rx * rx;
  const rys = ry * ry;
  const lam = x1p * x1p / rxs + y1p * y1p / rys;
  const scale = lam > 1 ? Math.sqrt(lam) : 1;
  const sign = n[3] !== n[4] ? 1 : -1;
  const num = rxs * rys - rxs * y1p * y1p - rys * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / (rxs * y1p * y1p + rys * x1p * x1p)));
  const cxp = (co * rx * y1p) / (ry * scale);
  const cyp = (-co * ry * x1p) / (rx * scale);
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const theta1 = Math.atan2((y1p - cyp) / (ry * scale), (x1p - cxp) / (rx * scale));
  let dTheta = Math.atan2((-y1p - cyp) / (ry * scale), (-x1p - cxp) / (rx * scale)) - theta1;
  if (n[4] === 0 && dTheta > 0) dTheta -= 2 * Math.PI;
  if (n[4] === 1 && dTheta < 0) dTheta += 2 * Math.PI;
  return { cx, cy, rx, ry, phi, theta1, dTheta, scale };
}

/** Cardinal extrema of the arc that fall inside its sweep (flat x,y list). */
function arcExtrema(c: ArcCenter): number[] {
  const cos = Math.cos(c.phi);
  const sin = Math.sin(c.phi);
  const lo = Math.min(c.theta1, c.theta1 + c.dTheta);
  const hi = Math.max(c.theta1, c.theta1 + c.dTheta);
  const sweep = c.dTheta >= 0 ? 1 : 0;
  const out: number[] = [];
  for (const k of [0, 1, 2, 3]) {
    let a = (k * Math.PI) / 2;
    while (sweep === 1 && a < c.theta1) a += 2 * Math.PI;
    while (sweep === 0 && a > c.theta1) a -= 2 * Math.PI;
    if (a >= lo - 1e-9 && a <= hi + 1e-9) {
      out.push(
        c.cx + c.rx * c.scale * cos * Math.cos(a) - c.ry * c.scale * sin * Math.sin(a),
        c.cy + c.rx * c.scale * sin * Math.cos(a) + c.ry * c.scale * cos * Math.sin(a),
      );
    }
  }
  return out;
}
