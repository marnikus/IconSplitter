// epspath.ts — geometry to PostScript path construction (RULE 3): the
// documented EPS subset's shapes (rect, circle, ellipse, line, polyline,
// polygon, path) as `newpath … moveto/lineto/curveto/closepath` sequences.
// No paint here — uploadeps wraps these with the CTM and the paint state.
// Arcs replay as cubic Béziers (the standard k = 4/3·tan(Δθ/4) split, ≤90°
// per segment); quadratic curves lift to cubics the same way.

import { arcCenter, type ArcCenter } from "./svgarc";
import { tokenizePath, type PathCmd } from "./svgpath";
import { fmt } from "./uploadgeom";

const KAPPA = 0.5522847498; // the circle-approximation constant

/** PS path construction for one shape element; null when outside the subset. */
export function shapePathPs(el: Element): string | null {
  switch (el.nodeName.toLowerCase()) {
    case "rect": return rectPs(el);
    case "circle": return circlePs(el);
    case "ellipse": return ellipsePs(el);
    case "line": return linePs(el);
    case "polyline": return pointsPs(el, false);
    case "polygon": return pointsPs(el, true);
    case "path": return pathDataPs(el.getAttribute("d"));
    default: return null;
  }
}

function rectPs(el: Element): string | null {
  if (el.getAttribute("rx") !== null || el.getAttribute("ry") !== null) return null; // rounded: outside the subset
  const w = num(el.getAttribute("width"));
  const h = num(el.getAttribute("height"));
  if (!(w > 0) || !(h > 0)) return null;
  const x = num(el.getAttribute("x"));
  const y = num(el.getAttribute("y"));
  return `newpath ${fmt(x)} ${fmt(y)} moveto ${fmt(x + w)} ${fmt(y)} lineto`
    + ` ${fmt(x + w)} ${fmt(y + h)} lineto ${fmt(x)} ${fmt(y + h)} lineto closepath`;
}

function circlePs(el: Element): string | null {
  const r = num(el.getAttribute("r"));
  if (!(r > 0)) return null;
  return `newpath ${fmt(num(el.getAttribute("cx")))} ${fmt(num(el.getAttribute("cy")))} ${fmt(r)} 0 360 arc closepath`;
}

/** An ellipse as four cubic Béziers (PostScript has no ellipse operator). */
function ellipsePs(el: Element): string | null {
  const rx = num(el.getAttribute("rx"));
  const ry = num(el.getAttribute("ry"));
  if (!(rx > 0) || !(ry > 0)) return null;
  const cx = num(el.getAttribute("cx"));
  const cy = num(el.getAttribute("cy"));
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  const p = (x: number, y: number) => `${fmt(x)} ${fmt(y)}`;
  return `newpath ${p(cx + rx, cy)} moveto`
    + ` ${p(cx + rx, cy + ky)} ${p(cx + kx, cy + ry)} ${p(cx, cy + ry)} curveto`
    + ` ${p(cx - kx, cy + ry)} ${p(cx - rx, cy + ky)} ${p(cx - rx, cy)} curveto`
    + ` ${p(cx - rx, cy - ky)} ${p(cx - kx, cy - ry)} ${p(cx, cy - ry)} curveto`
    + ` ${p(cx + kx, cy - ry)} ${p(cx + rx, cy - ky)} ${p(cx + rx, cy)} curveto closepath`;
}

function linePs(el: Element): string {
  return `newpath ${fmt(num(el.getAttribute("x1")))} ${fmt(num(el.getAttribute("y1")))} moveto`
    + ` ${fmt(num(el.getAttribute("x2")))} ${fmt(num(el.getAttribute("y2")))} lineto`;
}

function pointsPs(el: Element, closed: boolean): string | null {
  const raw = el.getAttribute("points");
  if (raw === null) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 4 || nums.length % 2 !== 0) return null;
  let ps = "newpath";
  for (let i = 0; i + 1 < nums.length; i += 2) {
    ps += ` ${fmt(nums[i])} ${fmt(nums[i + 1])} ${i === 0 ? "moveto" : "lineto"}`;
  }
  return closed ? `${ps} closepath` : ps;
}

// --- path data ----------------------------------------------------------------

interface PsCursor {
  x: number; y: number; sx: number; sy: number;
  c2x: number; c2y: number; qx: number; qy: number;
  hasC: boolean; hasQ: boolean;
  ps: string;
}

/** Path data → PS path construction; null when the data has no commands. */
export function pathDataPs(d: string | null): string | null {
  if (d === null || d.trim() === "") return null;
  const cur: PsCursor = { x: 0, y: 0, sx: 0, sy: 0, c2x: 0, c2y: 0, qx: 0, qy: 0, hasC: false, hasQ: false, ps: "newpath" };
  for (const cmd of tokenizePath(d)) HANDLERS[cmd.cmd.toUpperCase()]?.(cmd, cur);
  return cur.ps;
}

const HANDLERS: Record<string, (cmd: PathCmd, cur: PsCursor) => void> = {
  M: moveTo, L: lineTo, H: hLine, V: vLine, C: cubicTo, S: smoothCubicTo,
  Q: quadTo, T: smoothQuadTo, A: arcTo, Z: closePath,
};

/** Absolute/relative coordinate pair `i` of the command. */
function pt(cmd: PathCmd, cur: PsCursor, i: number): [number, number] {
  return cmd.cmd === cmd.cmd.toLowerCase()
    ? [cur.x + cmd.nums[2 * i], cur.y + cmd.nums[2 * i + 1]]
    : [cmd.nums[2 * i], cmd.nums[2 * i + 1]];
}

function moveTo(cmd: PathCmd, cur: PsCursor): void {
  const [x, y] = pt(cmd, cur, 0);
  cur.ps += ` ${fmt(x)} ${fmt(y)} moveto`;
  cur.x = x; cur.y = y; cur.sx = x; cur.sy = y;
  cur.hasC = false; cur.hasQ = false;
}

function lineTo(cmd: PathCmd, cur: PsCursor): void {
  const [x, y] = pt(cmd, cur, 0);
  cur.ps += ` ${fmt(x)} ${fmt(y)} lineto`;
  cur.x = x; cur.y = y;
  cur.hasC = false; cur.hasQ = false;
}

function hLine(cmd: PathCmd, cur: PsCursor): void {
  const x = cmd.cmd === "h" ? cur.x + cmd.nums[0] : cmd.nums[0];
  cur.ps += ` ${fmt(x)} ${fmt(cur.y)} lineto`;
  cur.x = x;
  cur.hasC = false; cur.hasQ = false;
}

function vLine(cmd: PathCmd, cur: PsCursor): void {
  const y = cmd.cmd === "v" ? cur.y + cmd.nums[0] : cmd.nums[0];
  cur.ps += ` ${fmt(cur.x)} ${fmt(y)} lineto`;
  cur.y = y;
  cur.hasC = false; cur.hasQ = false;
}

function cubicTo(cmd: PathCmd, cur: PsCursor): void {
  const [x1, y1] = pt(cmd, cur, 0);
  const [x2, y2] = pt(cmd, cur, 1);
  const [x, y] = pt(cmd, cur, 2);
  cur.ps += ` ${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x)} ${fmt(y)} curveto`;
  cur.c2x = x2; cur.c2y = y2; cur.hasC = true; cur.hasQ = false;
  cur.x = x; cur.y = y;
}

function smoothCubicTo(cmd: PathCmd, cur: PsCursor): void {
  const [x1, y1] = cur.hasC ? [2 * cur.x - cur.c2x, 2 * cur.y - cur.c2y] : [cur.x, cur.y];
  const [x2, y2] = pt(cmd, cur, 0);
  const [x, y] = pt(cmd, cur, 1);
  cur.ps += ` ${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x)} ${fmt(y)} curveto`;
  cur.c2x = x2; cur.c2y = y2; cur.hasC = true; cur.hasQ = false;
  cur.x = x; cur.y = y;
}

/** A quadratic lifts to a cubic: controls at 2/3 along the quad's legs. */
function quadTo(cmd: PathCmd, cur: PsCursor): void {
  const [qx, qy] = pt(cmd, cur, 0);
  const [x, y] = pt(cmd, cur, 1);
  const c1 = [cur.x + (2 / 3) * (qx - cur.x), cur.y + (2 / 3) * (qy - cur.y)];
  const c2 = [x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y)];
  cur.ps += ` ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(x)} ${fmt(y)} curveto`;
  cur.qx = qx; cur.qy = qy; cur.hasQ = true; cur.hasC = false;
  cur.x = x; cur.y = y;
}

function smoothQuadTo(cmd: PathCmd, cur: PsCursor): void {
  const qx = cur.hasQ ? 2 * cur.x - cur.qx : cur.x;
  const qy = cur.hasQ ? 2 * cur.y - cur.qy : cur.y;
  const [x, y] = pt(cmd, cur, 0);
  const c1 = [cur.x + (2 / 3) * (qx - cur.x), cur.y + (2 / 3) * (qy - cur.y)];
  const c2 = [x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y)];
  cur.ps += ` ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(x)} ${fmt(y)} curveto`;
  cur.qx = qx; cur.qy = qy; cur.hasQ = true; cur.hasC = false;
  cur.x = x; cur.y = y;
}

function arcTo(cmd: PathCmd, cur: PsCursor): void {
  const n = cmd.nums;
  const end: [number, number] = cmd.cmd === "a" ? [cur.x + n[5], cur.y + n[6]] : [n[5], n[6]];
  if ((n[0] === 0 || n[1] === 0) || (end[0] === cur.x && end[1] === cur.y)) {
    cur.ps += ` ${fmt(end[0])} ${fmt(end[1])} lineto`; // SVG: a zero radius is a straight line
  } else {
    for (const seg of cubicSegments(arcCenter([cur.x, cur.y], n, end))) {
      cur.ps += ` ${fmt(seg[0])} ${fmt(seg[1])} ${fmt(seg[2])} ${fmt(seg[3])} ${fmt(seg[4])} ${fmt(seg[5])} curveto`;
    }
  }
  cur.x = end[0]; cur.y = end[1];
  cur.hasC = false; cur.hasQ = false;
}

function closePath(_cmd: PathCmd, cur: PsCursor): void {
  cur.ps += " closepath";
  cur.x = cur.sx; cur.y = cur.sy;
  cur.hasC = false; cur.hasQ = false;
}

/** The arc as cubic segments: ≤90° each, k = 4/3·tan(Δθ/4). */
function cubicSegments(c: ArcCenter): number[][] {
  const count = Math.max(1, Math.ceil(Math.abs(c.dTheta) / (Math.PI / 2)));
  const step = c.dTheta / count;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: number[][] = [];
  for (let i = 0; i < count; i++) {
    const t0 = c.theta1 + i * step;
    const t1 = t0 + step;
    const p0 = arcPoint(c, t0);
    const p1 = arcPoint(c, t1);
    const d0 = arcTangent(c, t0);
    const d1 = arcTangent(c, t1);
    out.push([
      p0[0] + k * d0[0], p0[1] + k * d0[1],
      p1[0] - k * d1[0], p1[1] - k * d1[1],
      p1[0], p1[1],
    ]);
  }
  return out;
}

function arcPoint(c: ArcCenter, t: number): [number, number] {
  const cos = Math.cos(c.phi);
  const sin = Math.sin(c.phi);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  return [
    c.cx + c.rx * c.scale * cos * ct - c.ry * c.scale * sin * st,
    c.cy + c.rx * c.scale * sin * ct + c.ry * c.scale * cos * st,
  ];
}

function arcTangent(c: ArcCenter, t: number): [number, number] {
  const cos = Math.cos(c.phi);
  const sin = Math.sin(c.phi);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  return [
    -c.rx * c.scale * cos * st - c.ry * c.scale * sin * ct,
    -c.rx * c.scale * sin * st + c.ry * c.scale * cos * ct,
  ];
}

function num(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
