// upgeom.ts — the SVG scene the export pipeline draws from (prompt §5).
// Owns: walking a parsed SVG document into drawable shapes (paths synthesized
// for every basic shape, presentation attributes resolved against the minimal
// CSS cascade, transforms accumulated), the inherited style chain, and honest
// tracking of everything this pipeline cannot draw (text, images, paint-server
// urls, markers…) so EPS preflight can fail clearly instead of drawing wrong.

import { IDENTITY, multiply, parseTransform, type Matrix, type Pt } from "./upmatrix";
import { allCommandPoints, parsePathData, type PathCommand } from "./uppath";
import { normalizeColorRef } from "./upcolor";
import { collectStyleRules, cssPropsFor, isSimpleSelector, type GeomProp, type StyleRule } from "./upcss";
import { jointExtents } from "./upbounds";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type ShapeKind = "path" | "rect" | "circle" | "ellipse" | "line" | "polyline" | "polygon" | "text";

export interface GeomShape {
  kind: ShapeKind;
  /** Normalized absolute commands (empty for approximated text). */
  commands: PathCommand[];
  /** Hull points including curve controls, in the element's own user units. */
  points: Pt[];
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  linejoin: "miter" | "round" | "bevel";
  linecap: "butt" | "round" | "square";
  miterlimit: number;
  fillRule: "nonzero" | "evenodd";
  dash: number[] | null;
  matrix: Matrix;
  /** Per-miter-joint stroke extents in user units (upbounds consumes these). */
  miterExtents: number[];
}

export interface GeomScene {
  shapes: GeomShape[];
  unsupported: Set<string>;
}

interface Inherit {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  linejoin: GeomShape["linejoin"];
  linecap: GeomShape["linecap"];
  miterlimit: number;
  fillRule: GeomShape["fillRule"];
  dash: number[] | null;
}

const ROOT_INHERIT: Inherit = {
  fill: "#000000", stroke: null, strokeWidth: 1, linejoin: "miter", linecap: "butt", miterlimit: 4, fillRule: "nonzero", dash: null,
};

const SHAPE_TAGS = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text"]);
/** Elements the pipeline cannot draw and reports by name. */
const FOREIGN_TAGS = new Set(["image", "use", "foreignObject", "video", "canvas"]);
const CONTAINER_TAGS = new Set(["g", "a", "switch", "svg"]);
/** Elements whose children never draw directly. */
const NO_DRAW_TAGS = new Set(["defs", "symbol", "clipPath", "mask", "pattern", "marker", "filter", "style", "linearGradient", "radialGradient"]);

interface WalkCtx {
  rules: StyleRule[];
  scene: GeomScene;
  visit: ShapeVisit;
}

/** A visitation for every drawing element, with its resolved style and matrix. */
export type ShapeVisit = (el: Element, resolved: ResolvedProps, matrix: Matrix) => void;

/**
 * Walks the document once and returns its scene, visiting every drawing
 * element on the way. parseScene collects geometry; upprepare reuses the same
 * walk to normalize the export copy — ONE cascade, no second resolver.
 */
export function walkScene(doc: Document, visit: ShapeVisit): GeomScene {
  const root = doc.documentElement;
  if (root === null || root.nodeName !== "svg") return { shapes: [], unsupported: new Set() };
  const rules = collectStyleRules(root);
  const scene: GeomScene = { shapes: [], unsupported: new Set() };
  if (rules.some((r) => !isSimpleSelector(r.selector))) scene.unsupported.add("complex-css");
  walk(root, IDENTITY, ROOT_INHERIT, { rules, scene, visit });
  return scene;
}

export function parseScene(doc: Document): GeomScene {
  return walkScene(doc, () => undefined);
}

function walk(el: Element, matrix: Matrix, inherit: Inherit, ctx: WalkCtx): void {
  const tag = el.localName;
  if (NO_DRAW_TAGS.has(tag)) return;
  if (FOREIGN_TAGS.has(tag)) {
    ctx.scene.unsupported.add(tag);
    return;
  }
  if (tag === "text") ctx.scene.unsupported.add("text");
  const props = resolveProps(el, inherit, ctx.rules);
  if (props.display === "none") return;
  trackUnsupportedPaint(el, ctx);
  const m = multiply(matrix, parseTransform(el.getAttribute("transform") ?? ""));
  if (SHAPE_TAGS.has(tag)) {
    ctx.visit(el, props, m);
    pushShape(el, m, props, ctx);
  }
  if (shouldDescend(tag, el)) for (const child of Array.from(el.children)) walk(child, m, props, ctx);
}

/** A shape element that parsed becomes a drawable; one that did not is named. */
function pushShape(el: Element, m: Matrix, props: ResolvedProps, ctx: WalkCtx): void {
  const shape = buildShape(el, el.localName as ShapeKind, m, props);
  if (shape === null) ctx.scene.unsupported.add("unparsable-path");
  else ctx.scene.shapes.push(shape);
}

/** Containers descend; shape elements do not; unknown tags with children do. */
function shouldDescend(tag: string, el: Element): boolean {
  if (CONTAINER_TAGS.has(tag)) return true;
  return !SHAPE_TAGS.has(tag) && el.children.length > 0;
}

export interface ResolvedProps extends Inherit {
  display: string | null;
}

function resolveProps(el: Element, inherit: Inherit, rules: StyleRule[]): ResolvedProps {
  const attrs = attrProps(el);
  const css = cssPropsFor(el, rules);
  const merged: Record<string, string | number | number[] | null> = { ...inherit, ...attrs, ...css };
  return {
    fill: asColor(merged.fill),
    stroke: asColor(merged.stroke),
    strokeWidth: asNumber(merged["stroke-width"], inherit.strokeWidth),
    linejoin: asJoin(merged["stroke-linejoin"], inherit.linejoin),
    linecap: asCap(merged["stroke-linecap"], inherit.linecap),
    miterlimit: clampMiter(asNumber(merged["stroke-miterlimit"], inherit.miterlimit)),
    fillRule: merged["fill-rule"] === "evenodd" ? "evenodd" : inherit.fillRule,
    dash: asDash(merged["stroke-dasharray"], inherit.dash),
    display: typeof merged.display === "string" ? merged.display : null,
  };
}

function attrProps(el: Element): Partial<Record<GeomProp, string>> {
  const out: Partial<Record<GeomProp, string>> = {};
  for (const name of ["fill", "stroke", "stroke-width", "stroke-linejoin", "stroke-linecap", "stroke-miterlimit", "fill-rule", "stroke-dasharray", "display"] as GeomProp[]) {
    const v = el.getAttribute(name);
    if (v !== null) out[name] = v;
  }
  return out;
}

function trackUnsupportedPaint(el: Element, ctx: WalkCtx): void {
  const paints = [el.getAttribute("fill"), el.getAttribute("stroke")];
  if (paints.some((p) => p !== null && p.trim().startsWith("url("))) ctx.scene.unsupported.add("gradient");
  for (const m of ["marker-start", "marker-mid", "marker-end"]) {
    if (el.getAttribute(m) !== null) ctx.scene.unsupported.add("marker");
  }
  if (el.getAttribute("clip-path") !== null || el.getAttribute("mask") !== null) ctx.scene.unsupported.add("clipping");
  if (el.getAttribute("filter") !== null) ctx.scene.unsupported.add("filter");
  const opacities = [el.getAttribute("opacity"), el.getAttribute("fill-opacity"), el.getAttribute("stroke-opacity")];
  if (opacities.some((o) => o !== null && Number(o) < 1)) ctx.scene.unsupported.add("opacity");
}

function buildShape(el: Element, kind: ShapeKind, m: Matrix, p: ResolvedProps): GeomShape | null {
  const built = kind === "text" ? textPoints(el) : shapeCommands(el, kind);
  if (built === null) return null;
  const stroke = p.stroke;
  return {
    kind,
    commands: built.commands,
    points: built.points,
    fill: p.fill,
    stroke,
    strokeWidth: stroke === null ? p.strokeWidth : Math.max(0, p.strokeWidth),
    linejoin: p.linejoin,
    linecap: p.linecap,
    miterlimit: p.miterlimit,
    fillRule: p.fillRule,
    dash: p.dash,
    matrix: m,
    miterExtents: stroke === null || p.linejoin !== "miter" ? [] : jointExtents(built.commands, p.strokeWidth, p.miterlimit),
  };
}

/** Synthesizes a path for every basic shape — ONE geometry engine (uppath). */
function shapeCommands(el: Element, kind: ShapeKind): { commands: PathCommand[]; points: Pt[] } | null {
  const d = kind === "path" ? el.getAttribute("d") : synthesizedD(el, kind);
  if (d === null) return null;
  const commands = parsePathData(d);
  return commands === null ? null : { commands, points: allCommandPoints(commands) };
}

function synthesizedD(el: Element, kind: ShapeKind): string | null {
  switch (kind) {
    case "rect": return rectD(el);
    case "circle": return arcD(el, "circle");
    case "ellipse": return arcD(el, "ellipse");
    case "line": return `M ${num(el, "x1")} ${num(el, "y1")} L ${num(el, "x2")} ${num(el, "y2")}`;
    case "polyline": case "polygon": return polyD(el, kind === "polygon");
    default: return null;
  }
}

function num(el: Element, name: string, dflt = 0): number {
  const v = Number(el.getAttribute(name));
  return Number.isFinite(v) ? v : dflt;
}

function rectD(el: Element): string {
  const x = num(el, "x"), y = num(el, "y");
  const w = num(el, "width"), h = num(el, "height");
  const rx = Math.min(num(el, "rx"), w / 2);
  const ry = Math.min(num(el, "ry", rx) || rx, h / 2);
  if (rx <= 0 && ry <= 0) return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  const r1 = rx > 0 ? rx : ry;
  const r2 = ry > 0 ? ry : rx;
  return [
    `M ${x + r1} ${y} H ${x + w - r1} A ${r1} ${r2} 0 0 1 ${x + w} ${y + r2}`,
    `V ${y + h - r2} A ${r1} ${r2} 0 0 1 ${x + w - r1} ${y + h}`,
    `H ${x + r1} A ${r1} ${r2} 0 0 1 ${x} ${y + h - r2}`,
    `V ${y + r2} A ${r1} ${r2} 0 0 1 ${x + r1} ${y} Z`,
  ].join(" ");
}

function arcD(el: Element, kind: "circle" | "ellipse"): string {
  const cx = num(el, "cx"), cy = num(el, "cy");
  const rx = kind === "circle" ? num(el, "r") : num(el, "rx");
  const ry = kind === "circle" ? num(el, "r") : num(el, "ry");
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

function polyD(el: Element, close: boolean): string | null {
  const nums = (el.getAttribute("points") ?? "").match(/[-+]?[\d.]+(?:[eE][-+]?\d+)?/g);
  if (nums === null || nums.length < 4) return null;
  const pts: string[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push(`${Number(nums[i])} ${Number(nums[i + 1])}`);
  return `M ${pts[0]} L ${pts.slice(1).join(" L ")}${close ? " Z" : ""}`;
}

/** Text is approximated by an em box (documented) — EPS preflight refuses it. */
function textPoints(el: Element): { commands: PathCommand[]; points: Pt[] } {
  const x = num(el, "x"), y = num(el, "y");
  const size = Math.max(1, num(el, "font-size", 16));
  const text = el.textContent ?? "";
  const w = text.length * size * 0.6;
  return { commands: [], points: [{ x, y: y - size }, { x: x + w, y }, { x, y }, { x: x + w, y: y - size }] };
}

function asColor(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "" || v.trim() === "none") return null;
  if (v.trim() === "currentColor") return "#000000"; // standalone document: UA default, black
  return normalizeColorRef(v);
}

function asNumber(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function asCap(v: unknown, dflt: GeomShape["linecap"]): GeomShape["linecap"] {
  return v === "round" || v === "square" ? v : dflt;
}

function asJoin(v: unknown, dflt: GeomShape["linejoin"]): GeomShape["linejoin"] {
  return v === "round" || v === "bevel" || v === "miter" ? v : dflt;
}

function clampMiter(v: number): number {
  return Math.min(20, Math.max(1, Number.isFinite(v) ? v : 4));
}

function asDash(v: unknown, dflt: number[] | null): number[] | null {
  if (typeof v !== "string" || v.trim() === "" || v.trim() === "none") return dflt;
  const nums = v.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return nums.length === 0 ? dflt : nums;
}
