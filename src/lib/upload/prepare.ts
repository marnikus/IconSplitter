// prepare.ts — the export SVG copy of the "SVG to upload" tab
// (RULE 1/3). The approved source is parsed, never modified; the export
// document is a re-rooted copy: viewBox = padded artboard expanded to the
// chosen artboard's aspect (fitArtboardToSize), artwork translated to centre
// it, width/height = the final artboard px, an explicit background rect
// painted first (fill-only: stroke="none", so it never inherits the
// artwork's stroke), and — when a stroke width is configured — every visible
// stroke normalized to that width in output px at 96 DPI,
// `vector-effect="non-scaling-stroke"` included. Content the geometry math
// cannot answer for (text, image, geometry-restyle CSS, a transform on the
// root) fails the preparation honestly instead of being guessed.

import { BACKGROUND_DEFAULT, artboardSizeOf, type UploadSettings } from "./settings";
import { normalizeHex } from "../svgbackground";
import { scaleOf } from "./geom/matrix";
import { isShape, strokeHits, visibleBounds, type Bounds } from "./geom/bounds";
import { fitArtboardToSize, fmt, ptToPx, type ArtboardFit } from "./geom";

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
  const doc = parseSvgDocument(sourceSvg);
  if (doc === null) return fail("parse", "the source is not well-formed XML");
  const root = doc.documentElement;
  if (root === null || name(root) !== "svg") {
    return fail("parse", "the document root is not an <svg> element");
  }
  if (root.getAttribute("transform") !== null) {
    return fail("unsupported", "a transform on the root <svg> element");
  }
  const vb = visibleBounds(root);
  if (vb !== null && vb.unsupported.length > 0) {
    return fail("unsupported", `unsupported content: ${vb.unsupported.join(", ")}`);
  }
  if (vb === null) return fail("no-geometry", "the document has no visible geometry");
  const size = artboardSizeOf(settings);
  const fit = fitArtboardToSize(vb.bounds, settings.paddingPct, size.width, size.height);
  const strokesNormalized = settings.strokePt > 0
    ? normalizeStrokes(root, ptToPx(settings.strokePt))
    : 0;
  const background = normalizeHex(settings.background) ?? BACKGROUND_DEFAULT;
  applyArtboard(root, fit, background);
  return {
    ok: true,
    svg: new XMLSerializer().serializeToString(doc),
    fit, bounds: vb.bounds, strokesNormalized, background,
  };
}

function parseSvgDocument(source: string): Document | null {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || name(root) === "parsererror" || doc.querySelector("parsererror") !== null) {
    return null;
  }
  return doc;
}

function fail(code: PrepareFailureCode, detail: string): PrepareResult {
  return { ok: false, code, detail };
}

/** Sets every visible stroke to `widthPx` output px, in local user units. */
function normalizeStrokes(root: Element, widthPx: number): number {
  let count = 0;
  for (const hit of strokeHits(root)) {
    if (hit.stroke.none || !isShape(hit.el)) continue;
    const k = scaleOf(hit.ctm);
    setStrokeWidth(hit.el, k > 1e-9 ? widthPx / k : widthPx);
    count++;
  }
  return count;
}

/** An explicit width wins over inherited and inline-style values. */
function setStrokeWidth(el: Element, width: number): void {
  stripStyleKeys(el, ["stroke-width", "vector-effect"]);
  el.setAttribute("stroke-width", fmt(width));
  el.removeAttribute("vector-effect");
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

/** Re-roots the document: aspect-matched viewBox, final px size, background, centred artwork. */
function applyArtboard(root: Element, fit: ArtboardFit, background: string): void {
  root.setAttribute("viewBox", fit.viewBox);
  root.setAttribute("width", String(fit.outW));
  root.setAttribute("height", String(fit.outH));
  root.setAttribute("version", "1.1");
  if (root.getAttribute("xmlns") === null) root.setAttribute("xmlns", SVG_NS);
  const doc = root.ownerDocument;
  const group = doc.createElementNS(SVG_NS, "g");
  group.setAttribute("transform", `translate(${fmt(fit.offsetX)} ${fmt(fit.offsetY)})`);
  for (const child of Array.from(root.children)) group.appendChild(child);
  root.appendChild(group);
  root.insertBefore(backgroundRect(doc, fit, background), group);
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
