// epssvg.ts — a genuine EPSF-3.0 file written from an approved SVG's own
// geometry (RULE 3: a real conversion, never a renamed PS/PDF). Owns: the
// PostScript prologue, the paint/fill-rule procedures, the path emission and
// the BoundingBox/creation-date DSC comments.
//
// Scope is honest: this generator covers what an icon actually is — filled and
// stroked paths, shapes, groups, transforms, `<use>`. Gradients, filters,
// masks, text and embedded rasters cannot be expressed in PostScript Level 3
// without a rasteriser, so they are reported through `epsdraw`'s `features`
// list and the export is Partial rather than silently wrong.
//
// The page is written at the requested physical size (px × 72 / dpi points), so
// a 15 MP export is a 3886 px square at 300 DPI = 932.64 pt = 32.9 cm.

import { buildDrawing, type DrawingInput, type EpsDrawing, type EpsShape } from "./epsdraw";
import { colourOf } from "./epspath";

/** SVG rgb() for PostScript `setrgbcolor`, with a fixed precision. */
export function psColour(rgb: [number, number, number]): string {
  return rgb.map((v) => Math.min(1, Math.max(0, v)).toFixed(4)).join(" ");
}

/** `x y m` / `x y l` — PostScript has no separate curve-start command. */
export function pathOps(shape: EpsShape): string {
  const parts: string[] = [];
  for (const seg of shape.segments) {
    const p = `${num(seg.p.x)} ${num(seg.p.y)}`;
    if (seg.kind === "M") parts.push(`${p} m`);
    else if (seg.kind === "L") parts.push(`${p} l`);
    else parts.push(`${num(seg.c1?.x)} ${num(seg.c1?.y)} ${num(seg.c2?.x)} ${num(seg.c2?.y)} ${p} c`);
  }
  return parts.join("\n");
}

function num(value: number | undefined): string {
  return (value ?? 0).toFixed(2);
}

/**
 * The element's paint, fill then stroke. `fill` clears the current path, so the
 * geometry is written again for the stroke — one shared path would silently
 * stroke nothing.
 */
export function paintOps(shape: EpsShape): string {
  const path = pathOps(shape);
  const lines: string[] = [];
  if (shape.style.fill !== null) {
    lines.push("gsave", `${psColour(shape.style.fill)} setrgbcolor`, path, shape.style.evenOdd ? "EODD" : "EF", "grestore");
  }
  if (shape.style.stroke !== null) {
    lines.push("gsave", `${psColour(shape.style.stroke)} setrgbcolor`, `${num(shape.style.width)} setlinewidth`,
      `${shape.style.cap} setlinecap`, `${shape.style.join} setlinejoin`, path, "S", "grestore");
  }
  return lines.join("\n");
}

const PROLOGUE = `%!PS-Adobe-3.0 EPSF-3.0
%%Creator: IconSplitter SVG to upload
%%LanguageLevel: 3
%%Pages: 1
%%EndComments
% Filled paths are drawn even-odd or non-zero, matching the SVG fill-rule.
/eofill_ { eofill } bind def
/EF { fill } bind def
/EODD { eofill } bind def`;

export interface EpsFile {
  ok: boolean;
  error: string | null;
  /** The EPS source text. */
  eps: string;
  /** Ink box in points, as written into %%BoundingBox. */
  box: { x: number; y: number; w: number; h: number } | null;
  width: number;
  height: number;
  features: string[];
  warnings: string[];
}

/** The whole document as an EPSF file, or the reason there is none. */
export function svgToEps(input: DrawingInput & { createdAt?: string }): EpsFile {
  const built = buildDrawing(input);
  if (!built.ok || built.drawing === null) {
    return { ok: false, error: built.error ?? "conversion failed", eps: "", box: null, width: input.widthPt, height: input.heightPt, features: [], warnings: [] };
  }
  const drawing = built.drawing;
  const box = inkBox(drawing); // whole-point DSC values, from the measured ink
  const eps = assemble(drawing, box, input.createdAt ?? new Date().toISOString());
  return { ok: true, error: null, eps, box, width: drawing.width, height: drawing.height, features: drawing.features, warnings: drawing.warnings };
}

/** The measured ink box, snapped to whole points and clamped to the page. */
export function inkBox(drawing: EpsDrawing): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, Math.floor(drawing.ink.x));
  const y = Math.max(0, Math.floor(drawing.ink.y));
  const right = Math.min(drawing.width, Math.ceil(drawing.ink.x + drawing.ink.w));
  const top = Math.min(drawing.height, Math.ceil(drawing.ink.y + drawing.ink.h));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, top - y) };
}

function assemble(drawing: EpsDrawing, box: { x: number; y: number; w: number; h: number }, createdAt: string): string {
  const header = [
    `%%BoundingBox: ${Math.floor(box.x)} ${Math.floor(box.y)} ${Math.ceil(box.x + box.w)} ${Math.ceil(box.y + box.h)}`,
    `%%HiResBoundingBox: ${box.x.toFixed(3)} ${box.y.toFixed(3)} ${(box.x + box.w).toFixed(3)} ${(box.y + box.h).toFixed(3)}`,
    `%%BoundingBox: 0 0 ${Math.ceil(drawing.width)} ${Math.ceil(drawing.height)}`.replace("%%BoundingBox", "%%PageBoundingBox"),
    `%%CreationDate: ${createdAt.replace(/\.\d+Z$/, "Z")}`,
    `%%Title: icon export`,
    "%%EndComments",
    "%%BeginProlog",
  ].join("\n");
  const body = drawing.shapes.map((shape) => paintOps(shape)).join("\n");
  return `${PROLOGUE}\n${header}\n%%EndProlog\n%%BeginSetup\n${drawing.width.toFixed(2)} ${drawing.height.toFixed(2)} scale\n%%EndSetup\n%%Page: 1 1\n${body}\nshowpage\n%%EOF\n`;
}

export { colourOf };
