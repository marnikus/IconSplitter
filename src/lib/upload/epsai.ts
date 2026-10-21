// epsai.ts — pure TypeScript Adobe Illustrator 10 native vector stream writer
// (`%AI9_PrivateDataBegin … %AI9_DataStream … %AI9_PrivateDataEnd`, compressed
// via `epszlib.ts`). Gives Illustrator / CorelDRAW / Affinity / microstock
// validators 100% live editable vector paths + native Gradient Swatches
// (`%AI5_BeginGradient`, `Bb`/`Bh`/`Bg`/`Xm`/`BB`) with ZERO raster objects.

import { fmt } from "./geom";
import { multiply, type Matrix } from "./geom/matrix";
import type { Outline } from "./geom/outline";
import type { Rgb } from "./epsgradient";
import type { EpsBoundingBox, EpsOptions } from "./epsdoc";
import type { FlatStop, ResolvedGradient } from "./epsshading";
import { encodeAiDataStream } from "./epszlib";

type PathOp = Outline["ops"][number];

export type AiFill = { kind: "solid"; color: Rgb } | Extract<ResolvedGradient, { kind: "linear" | "radial" }>;

export interface AiStroke {
  color: Rgb;
  width: number;
  cap: number;
  join: number;
  miter: number;
  dash: number[] | null;
  dashOffset: number;
}

export interface AiShapeInput {
  outline: Outline;
  toArt: Matrix;
  evenOdd: boolean;
  fill: AiFill | null;
  stroke: AiStroke | null;
}

export class AiStreamBuilder {
  private readonly defs: string[] = [];
  private readonly byKey = new Map<string, string>();
  private readonly shapes: string[] = [];

  addShape(shape: AiShapeInput): void {
    const subs = splitSubpaths(shape.outline.ops);
    if (subs.length === 0) return;
    if (shape.fill === null && shape.stroke === null) return;
    const grad = shape.fill !== null && shape.fill.kind !== "solid"
      ? this.gradientInstance(shape.fill, shape.toArt)
      : null;
    this.shapes.push(renderPathObject(shape, subs, grad));
  }

  private defineSwatch(kind: "linear" | "radial", stops: FlatStop[]): string {
    const key = `${kind}:${stops.map((s) => `${fmt(s.offset)}:${aiInk(s.color)}`).join("|")}`;
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;
    const name = `Gradient ${this.defs.length + 1}`;
    this.byKey.set(key, name);
    const ordered = kind === "linear" ? [...stops].reverse() : stops;
    const lines = ordered.map((s) => `${aiInk(s.color)} 2 50 ${fmt(s.offset * 100)} %_Bs`);
    this.defs.push(
      `%AI5_BeginGradient: (${name})\n(${name}) ${kind === "radial" ? 1 : 0} ${stops.length} Bd\n[\n`
      + `${lines.join("\n")}\nBD\n%AI5_EndGradient`,
    );
    return name;
  }

  private gradientInstance(fill: Extract<AiFill, { kind: "linear" | "radial" }>, toArt: Matrix): string {
    const name = this.defineSwatch(fill.kind, fill.stops);
    const t = multiply(toArt, fill.mat);
    return fill.kind === "radial" ? radialInstance(name, fill, t) : linearInstance(name, fill, t);
  }

  /** Complete `%AI9_PrivateDataBegin … %AI9_PrivateDataEnd` trailer section. */
  buildPrivateSection(box: EpsBoundingBox, hires: EpsBoundingBox, opts: EpsOptions): string {
    const stream = this.buildDocument(box, hires);
    return [
      "%AI9_PrivateDataBegin",
      "%!PS-Adobe-3.0 EPSF-3.0",
      "%%Creator: IconSplitter (SVG to upload)",
      "%%AI8_CreatorVersion: 10.0.0",
      `%%Title: (${escapeParens(opts.title ?? "export.eps")})`,
      "%AI9_DataStream",
      encodeAiDataStream(stream),
      "%AI9_PrivateDataEnd",
    ].join("\n");
  }

  private buildDocument(box: EpsBoundingBox, hires: EpsBoundingBox): string {
    const setup = this.defs.length === 0 ? "" : `${this.defs.length} Bn\n${this.defs.join("\n")}\n`;
    const body = this.shapes.length === 0 ? "" : `${this.shapes.join("\n")}\n`;
    return [
      ...aiHeaderLines(box, hires),
      "%%EndComments",
      "%%BeginProlog",
      "%%EndProlog",
      `%%BeginSetup\n${setup}%%EndSetup`,
      "%AI5_BeginLayer",
      "1 1 1 1 0 0 1 0 79 128 255 0 50 0 Lb",
      "(Layer 1) Ln",
      "0 A",
      "0 Xw",
      `${body}LB`,
      "%AI5_EndLayer--",
      "%%PageTrailer",
      "gsave annotatepage grestore showpage",
      "%%Trailer",
      "%%EOF\n",
    ].join("\n");
  }
}

function aiHeaderLines(box: EpsBoundingBox, hires: EpsBoundingBox): string[] {
  const w = hires.urx - hires.llx;
  const h = hires.ury - hires.lly;
  const cx = (hires.llx + hires.urx) / 2;
  const cy = (hires.lly + hires.ury) / 2;
  return [
    "%!PS-Adobe-3.0",
    "%%Creator: IconSplitter (SVG to upload)",
    `%%BoundingBox: ${box.llx} ${box.lly} ${box.urx} ${box.ury}`,
    `%%HiResBoundingBox: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    "%%DocumentProcessColors: Cyan Magenta Yellow Black",
    "%AI5_FileFormat 6.0",
    "%AI3_ColorUsage: Color",
    `%AI3_Cropmarks: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    `%AI3_TemplateBox: ${fmt(cx)} ${fmt(cy)} ${fmt(cx)} ${fmt(cy)}`,
    `%AI3_TileBox: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    `%AI5_ArtSize: ${fmt(w)} ${fmt(h)}`,
    "%AI5_RulerUnits: 2",
    "%AI9_ColorModel: 1",
    "%AI5_NumLayers: 1",
  ];
}

interface Sub {
  start: [number, number];
  ops: Exclude<PathOp, { op: "M" | "Z" }>[];
  closed: boolean;
}

function splitSubpaths(ops: PathOp[]): Sub[] {
  const out: Sub[] = [];
  let cur: Sub | null = null;
  for (const op of ops) {
    if (op.op === "M") {
      cur = { start: [op.x, op.y], ops: [], closed: false };
      out.push(cur);
    } else if (op.op === "Z") {
      if (cur !== null) cur.closed = true;
    } else if (cur !== null) {
      cur.ops.push(op);
    }
  }
  return out.filter((s) => s.ops.length > 0);
}

function renderPathObject(shape: AiShapeInput, subs: Sub[], grad: string | null): string {
  const lines: string[] = [];
  if (shape.fill !== null) {
    const base = shape.fill.kind === "solid" ? shape.fill.color : shape.fill.stops[0].color;
    lines.push(`${aiInk(base)} Xa`, "0 O");
  }
  if (shape.stroke !== null) {
    lines.push(`${aiInk(shape.stroke.color)} XA`, "0 R", strokeLineStyle(shape.stroke, shape.toArt));
  }
  lines.push(shape.evenOdd ? "1 XR" : "0 XR");
  if (subs.length > 1) lines.push("*u");
  for (const sub of subs) lines.push(renderSubpath(sub, shape, grad));
  if (subs.length > 1) lines.push("*U");
  return lines.join("\n");
}

function renderSubpath(sub: Sub, shape: AiShapeInput, grad: string | null): string {
  const segs = subpathCoords(sub, shape.toArt);
  if (grad !== null) {
    const bb = shape.stroke === null ? "0 BB" : sub.closed ? "2 BB" : "1 BB";
    return `${segs}\n${grad}\n${sub.closed ? "f" : "F"}\n${bb}`;
  }
  const op = paintOp(shape.fill !== null, shape.stroke !== null, sub.closed);
  return `${segs}\n${op}`;
}

function subpathCoords(sub: Sub, m: Matrix): string {
  const [sx, sy] = mapPt(m, sub.start[0], sub.start[1]);
  const lines = [`${fmt(sx)} ${fmt(sy)} m`];
  let lx = sx;
  let ly = sy;
  for (const op of sub.ops) {
    const [x, y] = mapPt(m, op.x, op.y);
    if (op.op === "C") {
      const [x1, y1] = mapPt(m, op.x1, op.y1);
      const [x2, y2] = mapPt(m, op.x2, op.y2);
      lines.push(`${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x)} ${fmt(y)} C`);
    } else lines.push(`${fmt(x)} ${fmt(y)} L`);
    lx = x;
    ly = y;
  }
  if (sub.closed && Math.hypot(lx - sx, ly - sy) > 1e-6) lines.push(`${fmt(sx)} ${fmt(sy)} L`);
  return lines.join("\n");
}

function paintOp(hasFill: boolean, hasStroke: boolean, closed: boolean): string {
  const lower = hasFill && hasStroke ? "b" : hasFill ? "f" : "s";
  return closed ? lower : lower.toUpperCase();
}

function linearInstance(name: string, fill: Extract<AiFill, { kind: "linear" }>, t: Matrix): string {
  const dx = fill.x2 - fill.x1;
  const dy = fill.y2 - fill.y1;
  const u: Matrix = { a: dx, b: dy, c: -dy, d: dx, e: fill.x1, f: fill.y1 };
  const m = multiply(t, u);
  const angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const len = Math.max(1e-6, Math.hypot(m.a, m.b));
  return `Bb\n1 (${name}) ${fmt(m.e)} ${fmt(m.f)} ${fmt(angle)} ${fmt(len)} 1 0 0 1 0 0 Bg\n${mat6(m)} Xm`;
}

function radialInstance(name: string, fill: Extract<AiFill, { kind: "radial" }>, t: Matrix): string {
  const u: Matrix = { a: fill.r, b: 0, c: 0, d: fill.r, e: fill.cx, f: fill.cy };
  const m = multiply(t, u);
  const [fcx, fcy] = mapPt(t, fill.cx, fill.cy);
  const [ffx, ffy] = mapPt(t, fill.fx, fill.fy);
  const hx = ffx - fcx;
  const hy = ffy - fcy;
  const major = Math.max(1e-6, Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  const hDist = Math.hypot(hx, hy);
  const hAngle = hDist > 1e-9 ? (Math.atan2(hy, hx) * 180) / Math.PI : 0;
  const hFrac = Math.min(1, hDist / major);
  const angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return `Bb\n${fmt(hx)} ${fmt(hy)} ${fmt(hAngle)} ${fmt(hFrac)} Bh\n`
    + `1 (${name}) ${fmt(m.e)} ${fmt(m.f)} ${fmt(angle)} ${fmt(major)} 1 0 0 1 0 0 Bg\n${mat6(m)} Xm`;
}

function strokeLineStyle(st: AiStroke, toArt: Matrix): string {
  const scale = Math.max(1e-6, Math.hypot(toArt.a, toArt.b));
  const dash = st.dash === null ? "" : st.dash.map((d) => fmt(d * scale)).join(" ");
  return `${st.cap} J ${st.join} j ${fmt(st.width * scale)} w ${fmt(Math.max(1, st.miter))} M`
    + ` [${dash}] ${fmt(st.dashOffset * scale)} d`;
}

function aiInk(c: Rgb): string {
  const k = 1 - Math.max(c.r, c.g, c.b);
  if (k >= 1 - 1e-9) return `0 0 0 1 ${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)}`;
  const inv = 1 / (1 - k);
  const cyan = (1 - c.r - k) * inv;
  const mag = (1 - c.g - k) * inv;
  const yel = (1 - c.b - k) * inv;
  return `${fmt(cyan)} ${fmt(mag)} ${fmt(yel)} ${fmt(k)} ${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)}`;
}

function mapPt(m: Matrix, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

function mat6(m: Matrix): string {
  return `${fmt(m.a)} ${fmt(m.b)} ${fmt(m.c)} ${fmt(m.d)} ${fmt(m.e)} ${fmt(m.f)}`;
}

function escapeParens(text: string): string {
  return text.replace(/[\\()]/g, (ch) => `\\${ch}`).replace(/\s+/g, " ");
}
