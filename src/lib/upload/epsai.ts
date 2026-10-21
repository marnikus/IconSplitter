// epsai.ts — pure TypeScript Adobe Illustrator 30.8.2 native vector stream
// (`%AI9_PrivateDataBegin … %AI9_DataStream … %AI9_PrivateDataEnd`), CRLF
// byte-faithful to `icon-award-ribbon_8_02.eps`: `%AI5_FileFormat 6.0`, ArtStyles,
// `%_Br`/`%_BS`/`Bs` swatches, `%AI5_BeginPalette`, 13-arg `Bg` + `Xm` + `Bm`.

import { fmt } from "./geom";
import { multiply, type Matrix } from "./geom/matrix";
import type { Outline } from "./geom/outline";
import type { Rgb } from "./epsgradient";
import type { EpsBoundingBox, EpsOptions } from "./epsdoc";
import type { LiveStop, ResolvedGradient } from "./epsshading";
import { encodeAiDataStream } from "./epszlib";

const EOL = "\r\n";
type PathOp = Outline["ops"][number];

const DEFAULT_ART_STYLE = [
  "%AI5_Begin_NonPrinting", "Np", "%AI9_BeginArtStyles", "/KnownStyle :",
  "([Default]) /Name ,", "/SimpleStyle :", "0 O", "0 0 0 0 1 1 1 Xa", "0 R",
  "0.749721 0.679194 0.670497 0.901457 0 0 0 XA", "0 1 0 0 0 Xy",
  "0 J 0 j 1 w 10 M []0 d", "0 XR", "1 1 Xd", "/Paint ;", " /Def ;",
  "%AI9_EndArtStyles", "%AI5_End_NonPrinting--",
].join(EOL);

const DEFAULT_ART_STYLE_LIST = [
  "%AI5_Begin_NonPrinting", "Np", "%AI9_BeginArtStyleList", "([Default])",
  "%AI9_EndArtStyleList", "%AI5_End_NonPrinting--",
].join(EOL);

const LAYER_OPEN = [
  "%AI5_BeginLayer", "1 1 1 1 0 0 1 0 79 128 255 0 50 0 Lb", "(Layer 1) Ln",
  "0 A", "0 Xw", "0 O", "0 R", "0 1 0 0 0 Xy", "0 J 0 j 1 w 10 M []0 d", "0 XR",
];

const LAYER_CLOSE = ["LB", "%AI5_EndLayer--", "%%PageTrailer", "gsave annotatepage grestore showpage", "%%Trailer", `%%EOF${EOL}`];

export type AiFill = { kind: "solid"; color: Rgb } | Extract<ResolvedGradient, { kind: "linear" | "radial" }>;

export interface AiStroke {
  color: Rgb; width: number; cap: number; join: number; miter: number;
  dash: number[] | null; dashOffset: number;
}

export interface AiShapeInput {
  outline: Outline; toArt: Matrix; evenOdd: boolean; opacity: number;
  fill: AiFill | null; stroke: AiStroke | null;
}

export class AiStreamBuilder {
  private readonly defs: string[] = [];
  private readonly names: string[] = [];
  private readonly byKey = new Map<string, string>();
  private readonly shapes: string[] = [];

  addShape(shape: AiShapeInput): void {
    const subs = splitSubpaths(shape.outline.ops);
    if (subs.length === 0 || (shape.fill === null && shape.stroke === null)) return;
    const grad = shape.fill !== null && shape.fill.kind !== "solid" ? this.gradientInstance(shape.fill, shape.toArt) : null;
    this.shapes.push(renderPathObject(shape, subs, grad));
  }

  private defineSwatch(kind: "linear" | "radial", stops: LiveStop[]): string {
    const key = `${kind}:${stops.map((s) => `${fmt(s.offset)}:${fmt(s.opacity)}:${aiInk(s.color)}`).join("|")}`;
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;
    const name = `Gradient ${this.defs.length + 1}`;
    this.byKey.set(key, name);
    this.names.push(name);
    this.defs.push(buildGradientBlock(name, kind, stops));
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
      "%AI9_PrivateDataBegin", "%!PS-Adobe-3.0 EPSF-3.0",
      "%%Creator: Adobe Illustrator(R) 10.0", "%%AI8_CreatorVersion: 24.0.0",
      "%%For: (IconSplitter) ()", `%%Title: (${escapeParens(opts.title ?? "export.eps")})`,
    ];
    if (opts.createdAt !== undefined) header.push(`%%CreationDate: ${escapeParens(opts.createdAt)}`);
    header.push("%%Canvassize: 16383", "%AI9_DataStream", encodeAiDataStream(this.buildDocument(box, hires)), "%AI9_PrivateDataEnd");
    return header.join(EOL);
  }

  private buildDocument(box: EpsBoundingBox, hires: EpsBoundingBox): string {
    const setupBlocks = [DEFAULT_ART_STYLE];
    if (this.defs.length > 0) {
      setupBlocks.push(["%AI5_Begin_NonPrinting", "Np", `${this.defs.length} Bn`, ...this.defs, "%AI5_End_NonPrinting--"].join(EOL));
    }
    setupBlocks.push(paletteBlock(this.names), DEFAULT_ART_STYLE_LIST);
    return [
      ...aiHeaderLines(box, hires), "%%EndComments", "%%BeginProlog", "%%EndProlog",
      "%%BeginSetup", ...setupBlocks, "%%EndSetup",
      ...LAYER_OPEN, ...this.shapes, ...LAYER_CLOSE,
    ].join(EOL);
  }
}

function buildGradientBlock(name: string, kind: "linear" | "radial", stops: LiveStop[]): string {
  const ordered = kind === "linear" ? [...stops].reverse() : stops;
  const lines = [`%AI5_BeginGradient: (${name})`, `(${name}) ${kind === "radial" ? 1 : 0} ${ordered.length} Bd`, "["];
  for (let i = 0; i + 1 < ordered.length; i++) lines.push(`${aiInk(ordered[i].color)} 4 %_Br`);
  lines.push("[");
  for (const s of ordered) {
    const tok = `${aiInk(s.color)} 2 ${fmt(s.opacity)} 6 50 ${fmt(s.offset * 100)}`;
    lines.push(`${tok} %_BS`, `%_${tok} Bs`);
  }
  lines.push("BD", "%AI5_EndGradient");
  return lines.join(EOL);
}

function paletteBlock(names: string[]): string {
  const cells = names.map((n) => [`Bb`, `2 (${n}) 0 0 0 1 1 0 0 1 0 0 1 Bg`, `0 BB`, `(${n})`, `Pc`].join(EOL));
  return [
    "%AI5_BeginPalette", "0 0 Pb",
    "0.749721 0.679194 0.670497 0.901457 0 0 0 ([Registration]) 0 1 Xz", "([Registration])", "Pc",
    ...cells, "PB", "%AI5_EndPalette",
  ].join(EOL);
}

function aiHeaderLines(box: EpsBoundingBox, hires: EpsBoundingBox): string[] {
  const [w, h, cx, cy] = [hires.urx - hires.llx, hires.ury - hires.lly, (hires.llx + hires.urx) / 2, (hires.lly + hires.ury) / 2];
  const rect = `${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`;
  return [
    `%%BoundingBox: ${box.llx} ${box.lly} ${box.urx} ${box.ury}`, `%%HiResBoundingBox: ${rect}`,
    "%%DocumentProcessColors: Cyan Magenta Yellow Black", "%AI5_FileFormat 6.0",
    "%AI3_ColorUsage: Color", "%AI7_ImageSettings: 0", "%%RGBProcessColor: 0 0 0 ([Registration])",
    `%AI3_Cropmarks: ${rect}`, `%AI3_TemplateBox: ${fmt(cx)} ${fmt(cy)} ${fmt(cx)} ${fmt(cy)}`,
    `%AI3_TileBox: ${rect}`, `%AI5_ArtSize: ${fmt(w)} ${fmt(h)}`, "%AI5_RulerUnits: 2",
    "%AI9_ColorModel: 1", "%AI5_ArtFlags: 0 0 0 1 0 0 1 0 0", "%AI5_TargetResolution: 800",
    "%AI5_NumLayers: 1", "%AI5_OpenViewLayers: 7", "%%PageOrigin:0 0", "%AI9_Flatten: 1",
  ];
}

interface Sub { start: [number, number]; ops: Exclude<PathOp, { op: "M" | "Z" }>[]; closed: boolean }

function splitSubpaths(ops: PathOp[]): Sub[] {
  const out: Sub[] = [];
  let cur: Sub | null = null;
  for (const op of ops) {
    if (op.op === "M") { cur = { start: [op.x, op.y], ops: [], closed: false }; out.push(cur); }
    else if (op.op === "Z") { if (cur !== null) cur.closed = true; }
    else if (cur !== null) cur.ops.push(op);
  }
  return out.filter((s) => s.ops.length > 0);
}

function renderPathObject(shape: AiShapeInput, subs: Sub[], grad: string | null): string {
  const lines = [`0 ${fmt(shape.opacity)} 0 0 0 Xy`];
  if (shape.fill !== null) {
    lines.push(`${aiInk(shape.fill.kind === "solid" ? shape.fill.color : shape.fill.liveStops[0].color)} Xa`, "0 O");
  }
  if (shape.stroke !== null) lines.push(`${aiInk(shape.stroke.color)} XA`, "0 R", strokeLineStyle(shape.stroke, shape.toArt));
  lines.push(shape.evenOdd ? "1 XR" : "0 XR");
  if (subs.length > 1) lines.push("*u");
  for (const sub of subs) lines.push(renderSubpath(sub, shape, grad));
  if (subs.length > 1) lines.push("*U");
  return lines.join(EOL);
}

function renderSubpath(sub: Sub, shape: AiShapeInput, grad: string | null): string {
  const segs = subpathCoords(sub, shape.toArt);
  if (grad === null) return `${segs}${EOL}${paintOp(shape.fill !== null, shape.stroke !== null, sub.closed)}`;
  const bb = shape.stroke === null ? "0 BB" : sub.closed ? "2 BB" : "1 BB";
  return [segs, grad, sub.closed ? "f" : "F", bb].join(EOL);
}

function subpathCoords(sub: Sub, m: Matrix): string {
  const [sx, sy] = mapPt(m, sub.start[0], sub.start[1]);
  const lines = [`${fmt(sx)} ${fmt(sy)} m`];
  let [lx, ly] = [sx, sy];
  for (const op of sub.ops) {
    const [x, y] = mapPt(m, op.x, op.y);
    if (op.op === "C") {
      const [x1, y1] = mapPt(m, op.x1, op.y1);
      const [x2, y2] = mapPt(m, op.x2, op.y2);
      lines.push(`${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(x2 === op.x2 ? y2 : y2)} ${fmt(x)} ${fmt(y)} c`);
    } else lines.push(`${fmt(x)} ${fmt(y)} l`);
    [lx, ly] = [x, y];
  }
  if (sub.closed && Math.hypot(lx - sx, ly - sy) > 1e-6) lines.push(`${fmt(sx)} ${fmt(sy)} l`);
  return lines.join(EOL);
}

function paintOp(hasFill: boolean, hasStroke: boolean, closed: boolean): string {
  const lower = hasFill && hasStroke ? "b" : hasFill ? "f" : "s";
  return closed ? lower : lower.toUpperCase();
}

function linearInstance(name: string, fill: Extract<AiFill, { kind: "linear" }>, t: Matrix): string {
  const [dx, dy] = [fill.x2 - fill.x1, fill.y2 - fill.y1];
  const m = multiply(t, { a: dx, b: dy, c: -dy, d: dx, e: fill.x1, f: fill.y1 });
  const angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const len = Math.max(1e-6, Math.hypot(m.a, m.b));
  const bms = fill.liveStops.slice(0, -1).map((s, i) => {
    const span = Math.max(1e-6, fill.liveStops[i + 1].offset - s.offset);
    return `${mat6(multiply(m, { a: span, b: 0, c: 0, d: 1, e: s.offset, f: 0 }))} Bm`;
  });
  return [`Bb`, `1 (${name}) ${fmt(m.e)} ${fmt(m.f)} ${fmt(angle)} ${fmt(len)} 1 0 0 1 0 0 1 Bg`, `${mat6(m)} Xm`, ...bms].join(EOL);
}

function radialInstance(name: string, fill: Extract<AiFill, { kind: "radial" }>, t: Matrix): string {
  const m = multiply(t, { a: fill.r, b: 0, c: 0, d: fill.r, e: fill.cx, f: fill.cy });
  const [fcx, fcy] = mapPt(t, fill.cx, fill.cy);
  const [ffx, ffy] = mapPt(t, fill.fx, fill.fy);
  const [hx, hy] = [ffx - fcx, ffy - fcy];
  const [major, minor, angle] = ellipseAxes(m);
  const hDist = Math.hypot(hx, hy);
  const hAngle = hDist > 1e-9 ? (Math.atan2(hy, hx) * 180) / Math.PI : 0;
  return [
    "Bb", `${fmt(hx)} ${fmt(hy)} ${fmt(hAngle)} ${fmt(Math.min(1, hDist / major))} Bh`,
    `1 (${name}) ${fmt(m.e)} ${fmt(m.f)} ${fmt(angle)} ${fmt(major)} 1 0 0 1 0 0 ${fmt(Math.min(100, Math.max(0.01, minor / major)))} Bg`,
    `${mat6(m)} Xm`, `${mat6(m)} Bm`,
  ].join(EOL);
}

function ellipseAxes(m: Matrix): [number, number, number] {
  const [xx, yy, xy] = [m.a * m.a + m.c * m.c, m.b * m.b + m.d * m.d, m.a * m.b + m.c * m.d];
  const spread = Math.hypot(0.5 * (xx - yy), xy);
  const major = Math.max(1e-6, Math.sqrt(Math.max(0, 0.5 * (xx + yy) + spread)));
  const minor = Math.max(1e-6, Math.sqrt(Math.max(0, 0.5 * (xx + yy) - spread)));
  return [major, minor, (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI];
}

function strokeLineStyle(st: AiStroke, toArt: Matrix): string {
  const scale = Math.max(1e-6, Math.hypot(toArt.a, toArt.b));
  const dash = st.dash === null ? "" : st.dash.map((d) => fmt(d * scale)).join(" ");
  return `${st.cap} J ${st.join} j ${fmt(st.width * scale)} w ${fmt(Math.max(1, st.miter))} M [${dash}] ${fmt(st.dashOffset * scale)} d`;
}

function aiInk(c: Rgb): string {
  const k = 1 - Math.max(c.r, c.g, c.b);
  if (k >= 1 - 1e-9) return `0 0 0 1 ${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)}`;
  const inv = 1 / (1 - k);
  return `${fmt((1 - c.r - k) * inv)} ${fmt((1 - c.g - k) * inv)} ${fmt((1 - c.b - k) * inv)} ${fmt(k)} ${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)}`;
}

function mapPt(m: Matrix, x: number, y: number): [number, number] { return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; }
function mat6(m: Matrix): string { return `${fmt(m.a)} ${fmt(m.b)} ${fmt(m.c)} ${fmt(m.d)} ${fmt(m.e)} ${fmt(m.f)}`; }
function escapeParens(text: string): string { return text.replace(/[\\()]/g, (ch) => `\\${ch}`).replace(/\s+/g, " "); }
