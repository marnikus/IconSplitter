// upeps.ts — the genuine EPS writer (prompt §5/§6): a real EPSF-3.0
// PostScript subset (moveto/lineto/curveto/closepath, setrgbcolor,
// setlinewidth at the JPEG's 96-DPI physical size), never an unexplained
// rasterization. Owns: the page math (PostScript points per artboard unit),
// the y-axis flip (SVG draws from the top, PostScript from the bottom),
// quadratic→cubic elevation, the fill/stroke paint model, and the honest
// preflight naming everything the writer cannot draw.

import { applyMatrix, avgScale, type Matrix, type Pt } from "./upmatrix";
import { parseScene, type GeomScene, type GeomShape } from "./upgeom";
import type { PathCommand } from "./uppath";
import { colorToRgb, type Rgb } from "./upcolor";
import { parseSvgText } from "./upprepare";
import { STROKE_REF_DPI } from "./upsettings";
import type { RasterSize } from "./upfit";

/** Everything the EPS writer refuses to fake; any hit fails the EPS stage. */
export function epsPreflight(scene: GeomScene): string[] {
  return [...scene.unsupported];
}

/** PostScript points per artboard unit — the JPEG's 96-DPI physical size. */
export function pointsPerUnit(raster: RasterSize, artboardWidth: number): number {
  return (raster.width * (72 / STROKE_REF_DPI)) / artboardWidth;
}

export interface EpsArgs {
  /** The prepared export copy (strokes already normalized to the pt rule). */
  svg: string;
  raster: RasterSize;
  /** The configured stroke, in pt — every emitted setlinewidth must equal it. */
  strokePt: number;
  title: string;
}

export function buildEps(a: EpsArgs): string | { error: string } {
  const doc = parseSvgText(a.svg);
  if (doc === null) return { error: "the export copy is not a parsable SVG" };
  const scene = parseScene(doc);
  const issues = epsPreflight(scene);
  if (issues.length > 0) return { error: `unsupported for EPS: ${issues.join(", ")}` };
  const artboard = viewBoxSize(doc.documentElement.getAttribute("viewBox"));
  if (artboard === null) return { error: "the export copy has no readable viewBox" };
  const k = pointsPerUnit(a.raster, artboard.w);
  const mismatch = scene.shapes
    .filter((s) => s.stroke !== null)
    .find((s) => Math.abs(strokeWidthPt(s, k) - a.strokePt) > 0.05);
  if (mismatch !== undefined) {
    return { error: `stroke normalization mismatch: ${fmt(strokeWidthPt(mismatch, k))} pt instead of ${fmt(a.strokePt)}` };
  }
  const body = scene.shapes.flatMap((s) => shapeEps(s, k, artboard.h));
  return [...epsHeader(a.title, artboard, k), "gsave", ...body, "grestore", "showpage", "%%EOF"].join("\n");
}

function viewBoxSize(viewBox: string | null): { w: number; h: number } | null {
  if (viewBox === null) return null;
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) return null;
  return { w: parts[2], h: parts[3] };
}

function strokeWidthPt(s: GeomShape, k: number): number {
  return s.strokeWidth * avgScale(s.matrix) * k;
}

function epsHeader(title: string, artboard: { w: number; h: number }, k: number): string[] {
  const w = artboard.w * k;
  const h = artboard.h * k;
  return [
    "%!PS-Adobe-3.0 EPSF-3.0",
    "%%Creator: Icon Splitter — SVG to upload (genuine EPSF-3.0 subset)",
    `%%Title: ${psComment(title)}`,
    `%%BoundingBox: 0 0 ${Math.ceil(w)} ${Math.ceil(h)}`,
    `%%HiResBoundingBox: 0 0 ${fmt(w)} ${fmt(h)}`,
    "%%LanguageLevel: 2",
    "%%Pages: 1",
    "%%EndComments",
    "%%Page: 1 1",
  ];
}

function psComment(text: string): string {
  return text.replace(/([()\\])/g, "\\$1");
}

/** One shape as PostScript: geometry, then the paint model (fill and/or stroke). */
function shapeEps(s: GeomShape, k: number, hUnits: number): string[] {
  const geometry = ["newpath", ...pathOps(s.commands, s.matrix, k, hUnits)];
  if (s.fill !== null && s.stroke !== null) {
    return [...geometry, "gsave", ...rgbOps(s.fill), "fill", "grestore", ...strokeOps(s, k)];
  }
  if (s.fill !== null) return [...geometry, ...rgbOps(s.fill), s.fillRule === "evenodd" ? "eofill" : "fill"];
  if (s.stroke !== null) return [...geometry, ...strokeOps(s, k)];
  return [];
}

function strokeOps(s: GeomShape, k: number): string[] {
  const ops = [...rgbOps(s.stroke as string), `${fmt(strokeWidthPt(s, k))} setlinewidth`];
  ops.push(`${CAP_CODES[s.linecap]} setlinecap`, `${JOIN_CODES[s.linejoin]} setlinejoin`);
  if (s.linejoin === "miter") ops.push(`${fmt(s.miterlimit)} setmiterlimit`);
  if (s.dash !== null) ops.push(dashOp(s.dash, s, k));
  ops.push("stroke");
  return ops;
}

function dashOp(dash: number[], s: GeomShape, k: number): string {
  const scale = avgScale(s.matrix) * k;
  const pattern = dash.map((d) => fmt(d * scale)).join(" ");
  return `[${pattern}] 0 setdash`;
}

const CAP_CODES: Record<GeomShape["linecap"], number> = { butt: 0, round: 1, square: 2 };
const JOIN_CODES: Record<GeomShape["linejoin"], number> = { miter: 0, round: 1, bevel: 2 };

function rgbOps(value: string): string[] {
  const rgb: Rgb | null = colorToRgb(value);
  if (rgb === null) return ["0 0 0 setrgbcolor"];
  return [`${rgb.r.toFixed(3)} ${rgb.g.toFixed(3)} ${rgb.b.toFixed(3)} setrgbcolor`];
}

/** Absolute PostScript path operators; quadratics elevated to cubics. */
function pathOps(commands: PathCommand[], matrix: Matrix, k: number, hUnits: number): string[] {
  const ops: string[] = [];
  let cur: Pt | null = null;
  for (const c of commands) {
    if (c.cmd === "Z") {
      ops.push("closepath");
      continue;
    }
    if (c.cmd === "M" || c.cmd === "L") {
      ops.push(`${psPoint(applyMatrix(matrix, c.p), k, hUnits)} ${c.cmd === "M" ? "moveto" : "lineto"}`);
      cur = c.p;
      continue;
    }
    const [c1, c2, to] = cubicFrom(c, cur);
    const triple = `${psPoint(applyMatrix(matrix, c1), k, hUnits)} ${psPoint(applyMatrix(matrix, c2), k, hUnits)} ${psPoint(applyMatrix(matrix, to), k, hUnits)} curveto`;
    ops.push(triple);
    cur = to;
  }
  return ops;
}

function cubicFrom(c: Extract<PathCommand, { cmd: "C" | "Q" }>, cur: Pt | null): [Pt, Pt, Pt] {
  if (c.cmd === "C") return [c.c1, c.c2, c.p];
  const from = cur ?? { x: 0, y: 0 };
  const c1 = { x: from.x + (2 / 3) * (c.c.x - from.x), y: from.y + (2 / 3) * (c.c.y - from.y) };
  const c2 = { x: c.p.x + (2 / 3) * (c.c.x - c.p.x), y: c.p.y + (2 / 3) * (c.c.y - c.p.y) };
  return [c1, c2, c.p];
}

/** SVG user units → PostScript points, y flipped (PostScript origin is bottom-left). */
function psPoint(p: Pt, k: number, hUnits: number): string {
  return `${fmt(p.x * k)} ${fmt((hUnits - p.y) * k)}`;
}

function fmt(n: number): string {
  const trimmed = n.toFixed(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return trimmed === "-0" ? "0" : trimmed;
}
