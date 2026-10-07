// epsdraw.ts — the SVG document as a flat list of drawing operations (RULE 1/3).
// Owns: walking the tree, resolving `<use>`, composing transforms, mapping to
// PostScript points (origin bottom-left, y up) and reading each element's paint.
// It knows nothing about PostScript syntax — `epssvg.ts` writes the file.
//
// Elements EPS cannot express (gradients, filters, masks, text, embedded
// rasters) are NOT guessed at: they land in `skipped`, which is what turns the
// icon's export status into Partial instead of pretending the file is complete.

import { shapeBox, type Box } from "./svggeom";
import { documentBounds } from "./uploadbounds";
import { applyMatrix, multiply, scaleOf, transformOf, type Matrix, type Point } from "./svgtransform";
import { parseSvg } from "./svgvalidate";
import { svgValue } from "./svgstyle";
import { capOf, colourOf, joinOf, mappedBox, number, pathContext, type Segment } from "./epspath";

export interface EpsStyle {
  /** RGB 0..1, or null for "do not paint". */
  fill: [number, number, number] | null;
  stroke: [number, number, number] | null;
  /** Stroke width in points, already scaled to the EPS page. */
  width: number;
  cap: 0 | 1 | 2;
  join: 0 | 1 | 2;
  evenOdd: boolean;
}

export interface EpsShape {
  segments: Segment[];
  style: EpsStyle;
  /** The shape's ink box in EPS points — the EPS BoundingBox is built from it. */
  box: Box;
}

export interface EpsDrawing {
  shapes: EpsShape[];
  /** EPS width/height in points (the physical size at the configured DPI). */
  width: number;
  height: number;
  /**
   * The ink box in EPS points, mapped from the pipeline's own visible-bounds
   * measurement (strokes, caps, joins and transforms already included) — so the
   * BoundingBox and the preview cannot disagree about where the artwork is.
   */
  ink: Box;
  features: string[];
  warnings: string[];
}

export interface DrawingResult {
  ok: boolean;
  error: string | null;
  drawing: EpsDrawing | null;
}

export interface DrawingInput {
  /** The prepared export SVG (artboard viewBox, strokes already normalised). */
  svg: string;
  /** Physical size of the EPS, in points (px × 72 / dpi). */
  widthPt: number;
  heightPt: number;
}

const SHAPES = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"];
const UNSUPPORTED = ["text", "tspan", "image", "foreignobject", "filter", "mask", "clippath", "pattern", "lineargradient", "radialgradient"];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** The whole document as operations, or the reason it cannot be converted. */
export function buildDrawing(input: DrawingInput): DrawingResult {
  const { doc, errors } = parseSvg(input.svg);
  if (doc === null) return failed(errors[0] ?? "not usable as SVG");
  const box = viewBoxOf(doc.documentElement);
  if (box === null) return failed("the artboard has no viewBox");
  const measured = documentBounds(input.svg).bounds;
  if (measured === null) return failed("the artwork's visible bounds cannot be measured");
  const state = initialState(box, input);
  const ink = mappedBox(areaOf(measured, state), mapper(IDENTITY, state));
  visit(doc, doc.documentElement, IDENTITY, state);
  if (state.shapes.length === 0) return failed("there is nothing to convert to PostScript");
  return {
    ok: true,
    error: null,
    drawing: {
      shapes: state.shapes, width: input.widthPt, height: input.heightPt, ink,
      features: [...state.skipped].sort(),
      warnings: [...state.warnings].sort(),
    },
  };
}

function failed(error: string): DrawingResult {
  return { ok: false, error, drawing: null };
}

function initialState(box: Box, input: DrawingInput): State {
  return {
    shapes: [], skipped: new Set(), warnings: new Set(), seen: new Set(),
    from: box, scale: input.widthPt / box.w, height: input.heightPt,
  };
}

/**
 * The area the drawing is clipped against. Nothing measurable yet (content
 * defined in `<defs>`, say) is not a failure: the artboard is the honest ink box
 * and a warning says so.
 */
function areaOf(measured: NonNullable<ReturnType<typeof documentBounds>["bounds"]>, state: State): Box {
  if (measured.unmeasurable.length > 0) state.skipped.add(`unmeasurable: ${measured.unmeasurable.join(", ")}`);
  if (measured.visible === null) {
    state.warnings.add("no element bounds were measurable; the bounding box is the whole artboard");
    return measured.viewBox;
  }
  return measured.visible;
}

interface State {
  shapes: EpsShape[];
  skipped: Set<string>;
  warnings: Set<string>;
  seen: Set<string>;
  from: Box;
  scale: number;
  height: number;
}

function visit(doc: Document, el: Element, parent: Matrix, state: State): void {
  const tag = el.nodeName.toLowerCase();
  const matrix = multiply(parent, transformOf(el));
  noteEffects(el, state);
  // <defs> holds definitions, not drawings; <use> reaches them explicitly.
  if (tag === "defs") return;
  if (tag === "g" || tag === "a" || tag === "svg") return children(el, doc, matrix, state);
  if (tag === "use") return use(doc, el, matrix, state);
  if (UNSUPPORTED.includes(tag)) return void state.skipped.add(tag === "foreignobject" ? "foreignObject" : tag);
  if (SHAPES.includes(tag)) addShape(el, tag, matrix, state);
}

function children(el: Element, doc: Document, matrix: Matrix, state: State): void {
  for (const child of Array.from(el.children)) visit(doc, child, matrix, state);
}

function use(doc: Document, el: Element, matrix: Matrix, state: State): void {
  const id = (svgValue(el, "href") || svgValue(el, "xlink:href")).replace(/^#/, "");
  const target = id === "" ? null : findById(doc, id);
  if (target === null || state.seen.has(id)) return void state.skipped.add("use (unresolved reference)");
  state.seen.add(id);
  const offset: Matrix = [1, 0, 0, 1, number(svgValue(el, "x")), number(svgValue(el, "y"))];
  visit(doc, target, multiply(matrix, offset), state);
  state.seen.delete(id);
}

function noteEffects(el: Element, state: State): void {
  for (const name of ["filter", "mask", "clip-path", "opacity", "fill-opacity", "stroke-opacity"]) {
    const value = svgValue(el, name);
    if (value !== "" && value !== "none" && value !== "1") state.warnings.add(`${name}="${value}" (not expressible in EPS)`);
  }
}

function addShape(el: Element, tag: string, matrix: Matrix, state: State): void {
  const style = styleOf(el, matrix, state);
  if (style.fill === null && style.stroke === null) return void state.skipped.add(`${tag} with no paint`);
  const local = shapeBox(tag, (name) => svgValue(el, name));
  if (local === null) return void state.skipped.add(`${tag} with no usable geometry`);
  const at = mapper(matrix, state);
  const context = pathContext(at);
  const segments = tag === "path" ? context.path(svgValue(el, "d")) : context.shape(tag, (name) => svgValue(el, name));
  if (segments.length === 0) return void state.skipped.add(`${tag} with no drawable path`);
  if ((number(svgValue(el, "rx")) > 0 || number(svgValue(el, "ry")) > 0) && tag === "rect") {
    state.warnings.add("rounded rectangle corners are squared in the EPS");
  }
  state.shapes.push({ segments, style, box: mappedBox(local, at) });
}

/** SVG user units -> EPS points: scale to the physical width, then flip y. */
function mapper(matrix: Matrix, state: State) {
  return (p: Point): Point => {
    const world = applyMatrix(matrix, p);
    return { x: (world.x - state.from.x) * state.scale, y: state.height - (world.y - state.from.y) * state.scale };
  };
}

function styleOf(el: Element, m: Matrix, state: State): EpsStyle {
  const declared = number(svgValue(el, "stroke-width")) || 1;
  return {
    fill: colourOf(svgValue(el, "fill") || "#000000"),
    stroke: colourOf(svgValue(el, "stroke")),
    width: Math.max(0.01, declared * state.scale * scaleOf(m)),
    cap: capOf(svgValue(el, "stroke-linecap")),
    join: joinOf(svgValue(el, "stroke-linejoin")),
    evenOdd: svgValue(el, "fill-rule") === "evenodd",
  };
}

function viewBoxOf(root: Element): Box | null {
  const parts = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0
    ? { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
    : null;
}

function findById(doc: Document, id: string): Element | null {
  return Array.from(doc.getElementsByTagName("*")).find((el) => el.getAttribute("id") === id) ?? null;
}
