// prepare.ts — the export copy of an approved SVG (design §5, C4–C6). This is
// the pure half: it turns "these are the visible bounds, this padding, this
// output scale, this background and this stroke setting" into the plan the
// browser half applies, and it builds the export document as text. The approved
// source file is never edited: everything here produces a NEW string.
//
// The stroke rule is the one the request asks for, stated once: the target width
// is in the export's user units, the artwork is scaled by `plan.scale`, so the
// width written into the document is `target / scale` (after the transform it
// renders exactly the requested width). Elements that declare
// `vector-effect: non-scaling-stroke` opt out — their width is measured against
// the viewport by definition, and rewriting it would be a lie.

import { fitArtboard, type Bounds } from "./fit";
import { clampPaddingPx, toPx, type LengthUnit } from "./units";
import { escapeXml, svgMetadataBlocks, XMP_NS, type MetaText } from "./mime";
import { PX_PER_INCH } from "./units";

export interface StrokeInput {
  enabled: boolean;
  value: number;
  unit: LengthUnit;
}

export interface StrokePlan {
  applied: boolean;
  /** The width the caller asked for, in px at the declared DPI. */
  targetPx: number;
  /** The width written into the export document (target / scale). */
  docWidth: number;
  /** target / measured, when the document's own width could be measured. */
  factor: number | null;
  measuredPx: number | null;
}

export interface PaddingPx {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ExportPlan {
  artboard: { w: number; h: number };
  /** Where the artwork sits in the artboard. */
  content: Bounds;
  transform: string;
  scale: number;
  padding: PaddingPx;
  /** The colour flattened behind the artwork, or null for none. */
  background: string | null;
  stroke: StrokePlan;
  dpi: number;
}

export interface PlanArgs {
  bounds: Bounds;
  padding: { value: number; unit: LengthUnit };
  outputScale?: number;
  stroke: StrokeInput;
  /** Widest specified stroke in the document, in user units; null unknown. */
  documentStrokePx?: number | null;
  background: string | null;
}

/** The numbers the raster, the SVG copy and the export JSON all read. */
export function planExport(args: PlanArgs): ExportPlan {
  const sides = paddingSides(args.padding, args.bounds);
  const fit = fitArtboard({
    bounds: args.bounds,
    padding: { sides: [sides.top, sides.right, sides.bottom, sides.left] },
    strokeWidth: 0, // the visible bounds already include the measured stroke
    outputScale: args.outputScale ?? 1,
  });
  return {
    artboard: fit.artboard,
    content: fit.content,
    transform: fit.transform,
    scale: fit.scale,
    padding: sides,
    background: args.background,
    stroke: strokePlan(args.stroke, fit.scale, args.documentStrokePx ?? null),
    dpi: PX_PER_INCH,
  };
}

function strokePlan(stroke: StrokeInput, scale: number, measured: number | null): StrokePlan {
  const target = stroke.value > 0 ? toPx({ value: stroke.value, unit: stroke.unit }, 0) : 0;
  const applied = stroke.enabled && target > 0;
  return {
    applied,
    targetPx: applied ? round4(target) : 0,
    docWidth: applied ? round4(target / positive(scale)) : 0,
    factor: applied && measured !== null && measured > 0 ? round4(target / measured) : null,
    measuredPx: measured,
  };
}

/** Each side in px: a % means a share of the shorter side of the artwork. */
function paddingSides(padding: PlanArgs["padding"], bounds: Bounds): PaddingPx {
  const basis = Math.min(bounds.w, bounds.h);
  const px = clampPaddingPx(toPx({ value: padding.value, unit: padding.unit }, basis), basis);
  return { top: px, right: px, bottom: px, left: px };
}

export interface BuildArgs {
  source: string;
  plan: ExportPlan;
  meta?: MetaText | null;
}

export interface BuiltSvg {
  svg: string;
  warnings: string[];
}

/**
 * The export document: the original root, a full-frame background rect (behind
 * the artwork — the artwork itself is copied verbatim), the wrapping group with
 * the fit transform, and the optional stroke override. `viewBox`/`width`/
 * `height` describe the padded artboard, so the file opens at the right size.
 */
export function buildExportSvg(args: BuildArgs): BuiltSvg {
  const parts = splitRoot(args.source);
  if (parts === null) return { svg: args.source, warnings: ["The SVG has no root <svg> element — exported unchanged."] };
  const { inner, attrs } = parts;
  const meta = args.meta ?? null;
  const head = rootAttrs(attrs, args.plan.artboard, meta !== null);
  const body = [
    args.plan.background === null ? "" : backgroundRect(args.plan),
    strokeStyle(args.plan),
    `<g class="up-art" transform="${args.plan.transform}">${inner}</g>`,
  ].join("");
  const blocks = meta === null ? "" : svgMetadataBlocks(meta);
  return { svg: `${prolog(args.source)}${head}${blocks}${body}</svg>`, warnings: warningsOf(args.source) };
}

/** A source that declared itself XML keeps a declaration in the export copy. */
function prolog(source: string): string {
  return source.trimStart().startsWith("<?xml") ? "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" : "";
}

interface RootParts {
  inner: string;
  attrs: Record<string, string>;
}

/** Root open tag, its attributes and the inner content (tolerant, no DOM). */
function splitRoot(source: string): RootParts | null {
  const at = source.indexOf("<svg");
  if (at < 0) return null;
  const end = source.indexOf(">", at);
  const close = source.lastIndexOf("</svg>");
  if (end < 0 || close < end) return null;
  const open = source.slice(at, end + 1);
  return { inner: source.slice(end + 1, close), attrs: parseAttrs(open) };
}

/** name="value" pairs of a start tag; quotes are required by real documents. */
/**
 * The bounds the export fits: the document's OWN canvas (its viewBox, else its
 * width/height, else the conventional 512 square). Deliberately NOT an ink
 * estimate — the app never guesses where the artwork is; the author's canvas is
 * the frame, so nothing is ever cropped or re-centred by inference.
 */
export function boundsOfDocument(source: string): Bounds {
  const open = rootTagOf(source);
  const attrs = open === null ? {} : parseAttrs(open);
  const box = viewBoxNumbers(attrs.viewBox);
  if (box !== null) return box;
  const w = Number.parseFloat(attrs.width ?? "");
  const h = Number.parseFloat(attrs.height ?? "");
  if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) return { x: 0, y: 0, w, h };
  return { x: 0, y: 0, w: 512, h: 512 };
}

function rootTagOf(source: string): string | null {
  const at = source.search(/<svg[\s>]/i);
  if (at < 0) return null;
  const end = source.indexOf(">", at);
  return end < 0 ? null : source.slice(at, end + 1);
}

function viewBoxNumbers(value: string | undefined): Bounds | null {
  if (value === undefined) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

export function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/** The attributes the export root keeps: namespace declarations and geometry. */
function rootAttrs(attrs: Record<string, string>, artboard: { w: number; h: number }, withMeta: boolean): string {
  const ns = Object.entries(attrs).filter(([k]) => k === "xmlns" || k.startsWith("xmlns:"));
  const base: [string, string][] = ns.length > 0 ? ns : [["xmlns", "http://www.w3.org/2000/svg"]];
  // The packet's prefixes belong on the root: some parsers refuse an inner binding.
  if (withMeta) for (const { prefix, uri } of XMP_NS) base.push([`xmlns:${prefix}`, uri]);
  const decls = base.map(([k, v]) => `${k}="${escapeXml(v)}"`).join(" ");
  const w = round4(artboard.w);
  const h = round4(artboard.h);
  return `<svg ${decls} viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">`;
}

function backgroundRect(plan: ExportPlan): string {
  const w = round4(plan.artboard.w);
  const h = round4(plan.artboard.h);
  return `<rect x="0" y="0" width="${w}" height="${h}" fill="${escapeXml(plan.background ?? "")}"/>`;
}

/** The one stroke rule, excluding the elements that opt out by definition. */
function strokeStyle(plan: ExportPlan): string {
  if (!plan.stroke.applied) return "";
  return `<style>.up-art *:not([vector-effect="non-scaling-stroke"]){stroke-width:${plan.stroke.docWidth}}</style>`;
}

/** Things the exporter must say out loud rather than pretend about (§9). */
export function warningsOf(source: string): string[] {
  const out: string[] = [];
  if (/<text[\s>]/.test(source)) out.push("The SVG contains <text>: the JPEG renders it with the browser's fonts.");
  if (/<image[\s>]/.test(source)) out.push("The SVG embeds a raster <image>; the extra resolution cannot be invented.");
  if (/<filter[\s>]/.test(source)) out.push("The SVG uses <filter>; the JPEG shows the filtered result.");
  return out;
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
