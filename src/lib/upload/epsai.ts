// epsai.ts — pure TypeScript Adobe Illustrator native vector editing stream
// (`%AI9_PrivateDataBegin … %AI9_DataStream … %AI9_PrivateDataEnd`), byte-faithful
// to `Adobe Illustrator(R) 30.8.2` (`icon-award-ribbon_8_02.eps`): live translucent
// Gradient Swatches, 13-arg `Bg` + `Xm` + `Bm` + `Bh`, `Xy` opacity, live strokes.

import { fmt } from "./geom";
import { multiply, type Matrix } from "./geom/matrix";
import type { Outline } from "./geom/outline";
import type { Rgb } from "./epsgradient";
import type { EpsBoundingBox, EpsOptions } from "./epsdoc";
import type { LiveStop, ResolvedGradient } from "./epsshading";
import { encodeAiDataStream } from "./epszlib";

type PathOp = Outline["ops"][number];

export type AiFill =
  | { kind: "solid"; color: Rgb }
  | Extract<ResolvedGradient, { kind: "linear" | "radial" }>;

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
  opacity: number;
  fill: AiFill | null;
  stroke: AiStroke | null;
}

export class AiStreamBuilder {
  private readonly defs: string[] = [];
  private readonly byKey = new Map<string, string>();
  private readonly shapes: string[] = [];

  addShape(shape: AiShapeInput): void {
    const subs = splitSubpaths(shape.outline.ops);
    if (subs.length === 0 || (shape.fill === null && shape.stroke === null)) return;
    const grad = shape.fill !== null && shape.fill.kind !== "solid"
      ? this.gradientInstance(shape.fill, shape.toArt)
      : null;
    this.shapes.push(renderPathObject(shape, subs, grad));
  }

  private defineSwatch(kind: "linear" | "radial", stops: LiveStop[]): string {
    const key = `${kind}:${stops.map((s) => `${fmt(s.offset)}:${fmt(s.opacity)}:${aiInk(s.color)}`).join("|")}`;
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;
    const name = `Gradient ${this.defs.length + 1}`;
    this.byKey.set(key, name);
    const ordered = kind === "linear" ? [...stops].reverse() : stops;
    const lines = ordered.map((s) => `%_${aiInk(s.color)} 2 ${fmt(s.opacity)} 6 50 ${fmt(s.offset * 100)} Bs`);
    this.defs.push(
      `%AI5_BeginGradient: (${name})\n(${name}) ${kind === "radial" ? 1 : 0} ${stops.length} Bd\n`
      + `[\n<00FF>\n0\n${lines.join("\n")}\nBD\n%AI5_EndGradient`,
    );
    return name;
  }

  private gradientInstance(fill: Extract<AiFill, { kind: "linear" | "radial" }>, toArt: Matrix): string {
    const name = this.defineSwatch(fill.kind, fill.liveStops);
    const t = multiply(toArt, fill.mat);
    return fill.kind === "radial" ? radialInstance(name, fill, t) : linearInstance(name, fill, t);
  }

  /** Complete `%AI9_PrivateDataBegin … %AI9_PrivateDataEnd` trailer section. */
  buildPrivateSection(box: EpsBoundingBox, hires: EpsBoundingBox, opts: EpsOptions): string {
    const header = [
      "%AI9_PrivateDataBegin",
      "%!PS-Adobe-3.0 EPSF-3.0",
      "%%Creator: Adobe Illustrator(R) 10.0",
      "%%AI8_CreatorVersion: 24.0.0",
      "%%For: (IconSplitter) ()",
      `%%Title: (${escapeParens(opts.title ?? "export.eps")})`,
    ];
    if (opts.createdAt !== undefined) header.push(`%%CreationDate: ${escapeParens(opts.createdAt)}`);
    header.push("%%Canvassize: 16383", "%AI9_DataStream", encodeAiDataStream(this.buildDocument(box, hires)), "%AI9_PrivateDataEnd");
    return header.join("\n");
  }

  private buildDocument(box: EpsBoundingBox, hires: EpsBoundingBox): string {
    const setup = this.defs.length === 0
      ? ""
      : `%AI5_Begin_NonPrinting\nNp\n${this.defs.length} Bn\n${this.defs.join("\n")}\n%AI5_End_NonPrinting--\n`;
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
      "0 O",
      "0 R",
      "0 1 0 0 0 Xy",
      "0 J 0 j 1 w 10 M []0 d",
      "0 XR",
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
    `%%BoundingBox: ${box.llx} ${box.lly} ${box.urx} ${box.ury}`,
    `%%HiResBoundingBox: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    "%%DocumentProcessColors: Cyan Magenta Yellow Black",
    "%AI5_FileFormat 14.0",
    "%AI3_ColorUsage: Color",
    "%AI7_ImageSettings: 0",
    "%%RGBProcessColor: 0 0 0 ([Registration])",
    `%AI3_Cropmarks: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    `%AI3_TemplateBox: ${fmt(cx)} ${fmt(cy)} ${fmt(cx)} ${fmt(cy)}`,
    `%AI3_TileBox: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    `%AI5_ArtSize: ${fmt(w)} ${fmt(h)}`,
    "%AI5_RulerUnits: 2",
    "%AI9_ColorModel: 1",
    "%AI5_ArtFlags: 0 0 0 1 0 0 1 0 0",
    "%AI5_TargetResolution: 800",
    "%AI5_NumLayers: 1",
    "%AI5_OpenViewLayers: 7",
    "%%PageOrigin:0 0",
    "%AI9_Flatten: 1",
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
  const lines = [`0 ${fmt(shape.opacity)} 0 0 0 Xy`];
  if (shape.fill !== null) {
    const base = shape.fill.kind === "solid" ? shape.fill.color : shape.fill.liveStops[0].color;
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
  return `${segs}\n${paintOp(shape.fill !== null, shape.stroke !== null, sub.closed)}`;
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
      lines.push(`${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x)} ${fmt(y)} c`);
    } else lines.push(`${fmt(x)} ${fmt(y)} l`);
    lx = x;
    ly = y;
  }
  if (sub.closed && Math.hypot(lx - sx, ly - sy) > 1e-6) lines.push(`${fmt(sx)} ${fmt(sy)} l`);
  return lines.join("\n");
}

function paintOp(hasFill: boolean, hasStroke: boolean, closed: boolean): string {
  const lower = hasFill && hasStroke ? "b" : hasFill ? "f" : "s";
  return closed ? lower : lower.toUpperCase();
}

function linearInstance(name: string, fill: Extract<AiFill, { kind: "linear" }>, t: Matrix): string {
  const dx = fill.x2 - fill.x1;
  const dy = fill.y2 - fill.y1;
  const m = multiply(t, { a: dx, b: dy, c: -dy, d: dx, e: fill.x1, f: fill.y1 });
  const angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const len = Math.max(1e-6, Math.hypot(m.a, m.b));
  const bms: string[] = [];
  for (let i = 0; i + 1 < fill.liveStops.length; i++) {
    const s0 = fill.liveStops[i].offset;
    const span = Math.max(1e-6, fill.liveStops[i + 1].offset - s0);
    bms.push(`${mat6(multiply(m, { a: span, b: 0, c: 0, d: 1, e: s0, f: 0 }))} Bm`);
  }
  return [`Bb`, `1 (${name}) ${fmt(m.e)} ${fmt(m.f)} ${fmt(angle)} ${fmt(len)} 1 0 0 1 0 0 1 Bg`, `${mat6(m)} Xm`, ...bms].join("\n");
}

function radialInstance(name: string, fill: Extract<AiFill, { kind: "radial" }>, t: Matrix): string {
  const m = multiply(t, { a: fill.r, b: 0, c: 0, d: fill.r, e: fill.cx, f: fill.cy });
  const [fcx, fcy] = mapPt(t, fill.cx, fill.cy);
  const [ffx, ffy] = mapPt(t, fill.fx, fill.fy);
  const hx = ffx - fcx;
  const hy = ffy - fcy;
  const [major, minor, angle] = ellipseAxes(m);
  const hDist = Math.hypot(hx, hy);
  const hAngle = hDist > 1e-9 ? (Math.atan2(hy, hx) * 180) / Math.PI : 0;
  const hFrac = Math.min(1, hDist / major);
  const aspect = Math.min(100, Math.max(0.01, minor / major));
  return [
    "Bb",
    `${fmt(hx)} ${fmt(hy)} ${fmt(hAngle)} ${fmt(hFrac)} Bh`,
    `1 (${name}) ${fmt(m.e)} ${fmt(m.f)} ${fmt(angle)} ${fmt(major)} 1 0 0 1 0 0 ${fmt(aspect)} Bg`,
    `${mat6(m)} Xm`,
    `${mat6(m)} Bm`,
  ].join("\n");
}

function ellipseAxes(m: Matrix): [number, number, number] {
  const xx = m.a * m.a + m.c * m.c;
  const yy = m.b * m.b + m.d * m.d;
  const xy = m.a * m.b + m.c * m.d;
  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  const spread = Math.hypot(0.5 * (xx - yy), xy);
  const major = Math.max(1e-6, Math.sqrt(Math.max(0, 0.5 * (xx + yy) + spread)));
  const minor = Math.max(1e-6, Math.sqrt(Math.max(0, 0.5 * (xx + yy) - spread)));
  return [major, minor, (theta * 180) / Math.PI];
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
  return `${fmt((1 - c.r - k) * inv)} ${fmt((1 - c.g - k) * inv)} ${fmt((1 - c.b - k) * inv)} ${fmt(k)} ${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)}`;
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
