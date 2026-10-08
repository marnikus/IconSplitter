// prepare.ts — the export SVG copy of the "SVG to upload" tab
// (RULE 1/3). The approved source is parsed, never modified; the export
// document is a re-rooted copy: viewBox = the selected pixel artboard (or
// the previous content-sized Fit), artwork uniformly fitted and centered, and
// a fill-only background rect only for fill-only artwork. JPEG flattening is
// independent. When configured, existing visible strokes are normalized to
// the selected output width in px at 96 DPI, `vector-effect="non-scaling-stroke"`
// included, so the exported size remains visually consistent. Content the
// geometry math cannot answer for (text, image, geometry-restyle CSS, a
// transform on the root) fails the preparation honestly instead of being
// guessed.

import { artboardDimensions, BACKGROUND_DEFAULT, type UploadSettings } from "./settings";
import { normalizeHex } from "../svgbackground";
import { scaleOf } from "./geom/matrix";
import { isShape, strokeHits, visibleBounds, type Bounds } from "./geom/bounds";
import { fitArtboard, fmt, ptToPx, type ArtboardFit } from "./geom";

const SVG_NS = "http://www.w3.org/2000/svg";

export type PrepareFailureCode = "parse" | "no-geometry" | "unsupported";

export interface PreparedSvg {
  /** The export SVG text; the source document is never touched. */
  svg: string;
  fit: ArtboardFit;
  bounds: Bounds;
  /** Elements whose stroke-width was normalized (0 when strokePt = 0). */
  strokesNormalized: number;
  /** The background the export paints (normalized hex). */
  background: string;
}

export type PrepareResult =
  | ({ ok: true } & PreparedSvg)
  | { ok: false; code: PrepareFailureCode; detail: string };

/** Source SVG text + effective settings → the export copy, or an honest failure. */
export function prepareExportSvg(sourceSvg: string, settings: UploadSettings): PrepareResult {
  const inspection = inspectSource(sourceSvg);
  return inspection.ok ? prepareCopy(inspection.root, inspection.bounds, settings) : inspection;
}

interface SourceInspection { ok: true; root: Element; bounds: Bounds }
type InspectionResult = SourceInspection | Extract<PrepareResult, { ok: false }>;

function inspectSource(sourceSvg: string): InspectionResult {
  const doc = parseSvgDocument(sourceSvg);
  if (doc === null) return fail("parse", "the source is not well-formed XML");
  const root = doc.documentElement;
  if (root === null || name(root) !== "svg") return fail("parse", "the document root is not an <svg> element");
  if (root.getAttribute("transform") !== null) return fail("unsupported", "a transform on the root <svg> element");
  const bounds = visibleBounds(root);
  if (bounds !== null && bounds.unsupported.length > 0) {
    return fail("unsupported", `unsupported content: ${bounds.unsupported.join(", ")}`);
  }
  if (bounds === null) return fail("no-geometry", "the document has no visible geometry");
  return { ok: true, root, bounds: bounds.bounds };
}

function prepareCopy(root: Element, bounds: Bounds, settings: UploadSettings): PrepareResult {
  const fit = fitArtboard(bounds, settings.paddingPct, artboardDimensions(settings.artboard) ?? undefined);
  const hasVisibleStroke = hasArtworkStroke(root);
  const strokesNormalized = settings.strokePt > 0
    ? normalizeStrokes(root, ptToPx(settings.strokePt), fit.scale)
    : 0;
  const background = normalizeHex(settings.background) ?? BACKGROUND_DEFAULT;
  applyArtboard(root, fit, background, !hasVisibleStroke);
  return { ok: true, svg: new XMLSerializer().serializeToString(root.ownerDocument), fit, bounds, strokesNormalized, background };
}

function hasArtworkStroke(root: Element): boolean {
  return strokeHits(root).some((hit) => isShape(hit.el) && !hit.stroke.none && hit.stroke.width > 0);
}

function parseSvgDocument(source: string): Document | null {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || name(root) === "parsererror" || doc.querySelector("parsererror") !== null) {
    return null;
  }
  return doc;
}

function fail(code: PrepareFailureCode, detail: string): Extract<PrepareResult, { ok: false }> {
  return { ok: false, code, detail };
}

/** Sets every visible stroke to `widthPx` output px, in local user units. */
function normalizeStrokes(root: Element, widthPx: number, artboardScale: number): number {
  let count = 0;
  for (const hit of strokeHits(root)) {
    if (hit.stroke.none || hit.stroke.width <= 0 || !isShape(hit.el)) continue;
    const scale = scaleOf(hit.ctm) * artboardScale;
    setStrokeWidth(hit.el, scale > 1e-9 ? widthPx / scale : widthPx);
    count++;
  }
  return count;
}

/** An explicit width wins over inherited and inline-style values. */
function setStrokeWidth(el: Element, width: number): void {
  stripStyleKeys(el, ["stroke-width", "vector-effect"]);
  el.setAttribute("stroke-width", fmtStroke(width));
  el.removeAttribute("vector-effect");
}

function fmtStroke(width: number): string {
  return String(Math.round(width * 1e6) / 1e6);
}

function stripStyleKeys(el: Element, keys: string[]): void {
  const style = el.getAttribute("style");
  if (style === null) return;
  const kept = style.split(";")
    .map((decl) => decl.trim())
    .filter((decl) => decl !== "" && !keys.includes(keyOf(decl)));
  if (kept.length === 0) el.removeAttribute("style");
  else el.setAttribute("style", kept.join("; "));
}

function keyOf(decl: string): string {
  const at = decl.indexOf(":");
  return (at > 0 ? decl.slice(0, at) : decl).trim().toLowerCase();
}

/** Re-roots the document: exact board, proportionally fitted artwork, optional background. */
function applyArtboard(root: Element, fit: ArtboardFit, background: string, paintBackground: boolean): void {
  root.setAttribute("viewBox", fit.viewBox);
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute("width", fmt(fit.artW));
  root.setAttribute("height", fmt(fit.artH));
  const doc = root.ownerDocument;
  const group = doc.createElementNS(SVG_NS, "g");
  group.setAttribute("transform", artTransform(fit));
  for (const child of Array.from(root.children)) group.appendChild(child);
  root.appendChild(group);
  if (paintBackground) root.insertBefore(backgroundRect(doc, fit, background), group);
}

function artTransform(fit: ArtboardFit): string {
  const translate = `translate(${fmt(fit.offsetX)} ${fmt(fit.offsetY)})`;
  return fit.scale === 1 ? translate : `${translate} scale(${fmt(fit.scale)})`;
}

function backgroundRect(doc: Document, fit: ArtboardFit, background: string): Element {
  const rect = doc.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "0");
  rect.setAttribute("y", "0");
  rect.setAttribute("width", fmt(fit.artW));
  rect.setAttribute("height", fmt(fit.artH));
  rect.setAttribute("fill", background);
  rect.setAttribute("stroke", "none");
  return rect;
}

function name(el: Element): string {
  return el.nodeName.toLowerCase();
}
