// epswrite.ts — the LOCAL EPS writer (merge report §3.2 and §10: the base
// branch's "genuine local EPS capability", ported onto this tree's geometry).
// Why a local writer exists at all: EPS is PostScript, no browser writes it, and
// until now this tab could only ask a configured converter — a third-party
// service between an approved icon and its package. For the subset icons
// actually consist of, the file can be written here, offline and verifiably:
//
//   · the page is the ARTBOARD at 96 dpi (artboard units × 72/96 points), so an
//     export configured with a 2.2 pt stroke writes `2.2 setlinewidth` for the
//     unit-scale artwork: §9's "stroke intrinsic to the artboard" contract is
//     what the file shows, and the page states the package's own physical size;
//   · nothing is rasterized: real moveto/lineto/curveto/closepath operators,
//     quadratics elevated to cubics, SVG's top-left origin flipped to
//     PostScript's bottom-left one, real setrgbcolor / setlinecap /
//     setlinejoin / setdash paint;
//   · everything outside that subset (gradients and paint servers, filters,
//     text, opacity, markers, clipping, complex CSS) is NAMED and refused —
//     never approximated, never silently dropped.
//
// The caller passes the SCENE (`scene.ts` parsed the document once) and the
// stroke override the planner applied; this module is pure arithmetic, so the
// file it would write can be asserted in a test line by line.

import { applyMatrix, avgScale, type Matrix, type Pt } from "./geom/matrix";
import { colorToRgb, type Rgb } from "./geom/color";
import type { GeomScene, GeomShape } from "./geom/scene";
import type { PathCommand } from "./geom/path";

/** The physical resolution every measurement in the export is quoted at. */
export const EPS_DPI = 96;

/** PostScript points per artboard unit: 72/96 = 0.75. */
export const POINTS_PER_UNIT = 72 / EPS_DPI;

/** The page, in PostScript points: the artboard at `EPS_DPI`. */
export interface EpsPage {
  width: number;
  height: number;
  /** PostScript points per artboard unit. */
  perUnit: number;
}

export function epsPage(artboard: { w: number; h: number }): EpsPage {
  return { width: artboard.w * POINTS_PER_UNIT, height: artboard.h * POINTS_PER_UNIT, perUnit: POINTS_PER_UNIT };
}

/** The stroke override the planner applied, in the copy's own user units. */
export interface EpsStroke {
  /** What the copy's `<style>` rule sets (`plan.stroke.docWidth`). */
  width: number;
  /** What the SVG renders that as, in points (`plan.stroke.targetPx` → pt). */
  pt: number;
}

/** Everything the writer needs beyond the scene — assembled by the run step. */
export interface EpsRequest {
  artboard: { w: number; h: number };
  /** Null when no override is applied: each shape keeps its own width. */
  stroke: EpsStroke | null;
}

export interface EpsArgs extends EpsRequest {
  scene: GeomScene;
  /** The document title, written as a PostScript comment. */
  title: string;
}

/** What the writer refuses to draw, named — the EPS stage's preflight. */
export function epsPreflight(scene: GeomScene): string[] {
  const issues = [...scene.unsupported];
  if (scene.shapes.length === 0) issues.push("nothing-to-draw");
  return issues.sort();
}

/** The EPS text, or the reason it was refused. */
export function writeEps(args: EpsArgs): string | { error: string } {
  const issues = epsPreflight(args.scene);
  if (issues.length > 0) return { error: `unsupported for EPS: ${issues.join(", ")}` };
  const bad = badOverride(args.stroke);
  if (bad !== null) return { error: bad };
  const page = epsPage(args.artboard);
  const body = args.scene.shapes.flatMap((shape) => shapeEps(shape, page, args.stroke));
  return [...header(args.title, page), "gsave", ...body, "grestore", "showpage", "%%EOF"].join("\n");
}

/** A stroke override that is not a positive width cannot be printed honestly. */
function badOverride(stroke: EpsStroke | null): string | null {
  if (stroke === null) return null;
  if (!(stroke.width > 0) || !(stroke.pt > 0)) return "the stroke override is not a positive width";
  return null;
}

function header(title: string, page: EpsPage): string[] {
  return [
    "%!PS-Adobe-3.0 EPSF-3.0",
    "%%Creator: Icon Splitter — SVG to upload (local EPSF-3.0 writer)",
    `%%Title: ${psComment(title)}`,
    `%%BoundingBox: 0 0 ${Math.ceil(page.width)} ${Math.ceil(page.height)}`,
    `%%HiResBoundingBox: 0 0 ${fmt(page.width)} ${fmt(page.height)}`,
    "%%LanguageLevel: 2",
    "%%Pages: 1",
    "%%EndComments",
    "%%Page: 1 1",
  ];
}

/** One shape: its path, then the paint model (fill and/or stroke). */
function shapeEps(shape: GeomShape, page: EpsPage, stroke: EpsStroke | null): string[] {
  const geometry = ["newpath", ...pathOps(shape.commands, shape.matrix, page)];
  if (shape.fill !== null && shape.stroke !== null) {
    return [...geometry, "gsave", ...rgbOps(shape.fill), "fill", "grestore", ...strokeOps(shape, page, stroke)];
  }
  if (shape.fill !== null) return [...geometry, ...rgbOps(shape.fill), shape.fillRule === "evenodd" ? "eofill" : "fill"];
  if (shape.stroke !== null) return [...geometry, ...strokeOps(shape, page, stroke)];
  return [];
}

function strokeOps(shape: GeomShape, page: EpsPage, stroke: EpsStroke | null): string[] {
  const ops = [...rgbOps(shape.stroke as string), `${fmt(printedPt(shape, stroke, page))} setlinewidth`];
  ops.push(`${CAP_CODES[shape.linecap]} setlinecap`, `${JOIN_CODES[shape.linejoin]} setlinejoin`);
  if (shape.linejoin === "miter") ops.push(`${fmt(shape.miterlimit)} setmiterlimit`);
  if (shape.dash !== null) ops.push(dashOp(shape.dash, shape.matrix, page));
  ops.push("stroke");
  return ops;
}

/**
 * The width the file must print, in points. Three cases, and each one is the
 * width the SVG copy actually RENDERS with:
 *   · an override applied and the element not opted out → the override, scaled by
 *     the element's own accumulated transform (a `scale(2)` element renders twice
 *     as wide and must print twice as wide);
 *   · `vector-effect="non-scaling-stroke"` → the width's own value: by definition
 *     it is measured against the viewport, so no transform scales it (and the
 *     copy's `<style>` rule exempts exactly these elements);
 *   · no override → the element's declared width, scaled the same way.
 */
function printedPt(shape: GeomShape, stroke: EpsStroke | null, page: EpsPage): number {
  if (shape.nonScalingStroke) return shape.strokeWidth * page.perUnit;
  const width = stroke === null ? shape.strokeWidth : stroke.width;
  return width * avgScale(shape.matrix) * page.perUnit;
}

function dashOp(dash: readonly number[], matrix: Matrix, page: EpsPage): string {
  const scale = avgScale(matrix) * page.perUnit;
  return `[${dash.map((d) => fmt(d * scale)).join(" ")}] 0 setdash`;
}

const CAP_CODES: Record<GeomShape["linecap"], number> = { butt: 0, round: 1, square: 2 };
const JOIN_CODES: Record<GeomShape["linejoin"], number> = { miter: 0, round: 1, bevel: 2 };

/** A colour this writer cannot parse is drawn black — the colour toRgb allows. */
function rgbOps(value: string): string[] {
  const rgb: Rgb | null = colorToRgb(value);
  if (rgb === null) return ["0 0 0 setrgbcolor"];
  return [`${rgb.r.toFixed(3)} ${rgb.g.toFixed(3)} ${rgb.b.toFixed(3)} setrgbcolor`];
}

/** Absolute PostScript path operators; quadratics are elevated to cubics. */
function pathOps(commands: readonly PathCommand[], matrix: Matrix, page: EpsPage): string[] {
  const ops: string[] = [];
  let current: Pt | null = null;
  for (const c of commands) {
    if (c.cmd === "Z") {
      ops.push("closepath");
      continue;
    }
    if (c.cmd === "M" || c.cmd === "L") {
      ops.push(`${psPoint(applyMatrix(matrix, c.p), page)} ${c.cmd === "M" ? "moveto" : "lineto"}`);
      current = c.p;
      continue;
    }
    const [c1, c2, to] = cubicFrom(c, current);
    ops.push([...([c1, c2, to] as Pt[]).map((p) => psPoint(applyMatrix(matrix, p), page)), "curveto"].join(" "));
    current = to;
  }
  return ops;
}

function cubicFrom(c: Extract<PathCommand, { cmd: "C" | "Q" }>, current: Pt | null): [Pt, Pt, Pt] {
  if (c.cmd === "C") return [c.c1, c.c2, c.p];
  const from = current ?? { x: 0, y: 0 };
  const c1 = { x: from.x + (2 / 3) * (c.c.x - from.x), y: from.y + (2 / 3) * (c.c.y - from.y) };
  const c2 = { x: c.p.x + (2 / 3) * (c.c.x - c.p.x), y: c.p.y + (2 / 3) * (c.c.y - c.p.y) };
  return [c1, c2, c.p];
}

/** SVG user units → PostScript points, y flipped (PostScript is bottom-left). */
function psPoint(p: Pt, page: EpsPage): string {
  return `${fmt(p.x * page.perUnit)} ${fmt(page.height - p.y * page.perUnit)}`;
}

function psComment(text: string): string {
  return ascii(text).replace(/([()\\])/g, "\\$1");
}

/** A PostScript comment line is ASCII: anything else is transliterated. */
function ascii(text: string): string {
  return [...text].map((ch) => (ch >= " " && ch <= "~" ? ch : "?")).join("");
}

function fmt(n: number): string {
  const trimmed = n.toFixed(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return trimmed === "-0" ? "0" : trimmed;
}
