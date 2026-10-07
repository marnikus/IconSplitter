// prepare.ts — the export SVG copy of the "SVG to upload" tab
// (RULE 1/3). The approved source is parsed, never modified; the export
// document is a re-rooted copy: viewBox = padded artboard (fitArtboard),
// artwork translated to centre it, an explicit background rect painted
// first (output policy: the background IS part of the export), and — when a
// stroke width is configured — every visible stroke normalized to that width
// in output px at 96 DPI, `vector-effect="non-scaling-stroke"` included, so
// the export renders the configured width at its intrinsic size. Content the
// geometry math cannot answer for (text, image, geometry-restyle CSS, a
// transform on the root) fails the preparation honestly instead of being
// guessed. Clean code (2026-10-08) is part of the copy: SVG 1.1, a real
// viewBox, no raster, no `<style>`, and no ids, classes or editor bloat —
// see lib/upload/clean.

import { BACKGROUND_DEFAULT, artboardSize, type UploadSettings } from "./settings";
import { cleanExportDom, unsupportedContent } from "./clean";
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

export type PrepareFailure = Extract<PrepareResult, { ok: false }>;
export type PrepareResult =
  | ({ ok: true } & PreparedSvg)
  | { ok: false; code: PrepareFailureCode; detail: string };

/** Source SVG text + effective settings → the export copy, or an honest failure. */
export function prepareExportSvg(sourceSvg: string, settings: UploadSettings): PrepareResult {
  const doc = parseSvgDocument(sourceSvg);
  if (doc === null) return fail("parse", "the source is not well-formed XML");
  const root = doc.documentElement;
  const veto = sourceVeto(root);
  if (veto !== null) return veto;
  cleanExportDom(root as Element, { keepRootEmbeds: false });
  const vb = visibleBounds(root);
  if (vb !== null && vb.unsupported.length > 0) {
    return fail("unsupported", `unsupported content: ${vb.unsupported.join(", ")}`);
  }
  if (vb === null) return fail("no-geometry", "the document has no visible geometry");
  const fit = fitArtboard(vb.bounds, settings.paddingPct, artboardSize(settings.artboard));
  // The stroke width is a width in the FINAL file, so it is divided by the
  // artboard's scale as well: a 2.2 pt stroke stays 2.2 pt whatever size the
  // artboard pinned the artwork to.
  const strokesNormalized = settings.strokePt > 0
    ? normalizeStrokes(root, ptToPx(settings.strokePt) / fit.scale)
    : 0;
  const background = normalizeHex(settings.background) ?? BACKGROUND_DEFAULT;
  applyArtboard(root, fit, background);
  return {
    ok: true,
    svg: new XMLSerializer().serializeToString(doc),
    fit, bounds: vb.bounds, strokesNormalized, background,
  };
}

/**
 * Only failures the SOURCE itself causes, checked before anything is built:
 * a root that is not a plain `<svg>`, a root transform, and the content the
 * clean policy refuses outright (raster, unfoldable stylesheets) — fail-closed,
 * because cleaning those WOULD change the picture.
 */
function sourceVeto(root: Element | null): PrepareFailure | null {
  if (root === null || name(root) !== "svg") {
    return fail("parse", "the document root is not an <svg> element");
  }
  if (root.getAttribute("transform") !== null) {
    return fail("unsupported", "a transform on the root <svg> element");
  }
  const unsupported = unsupportedContent(root);
  return unsupported === null ? null : fail("unsupported", unsupported);
}

function parseSvgDocument(source: string): Document | null {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || name(root) === "parsererror" || doc.querySelector("parsererror") !== null) {
    return null;
  }
  return doc;
}

function fail(code: PrepareFailureCode, detail: string): PrepareFailure {
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

/** Re-roots the document: padded artboard viewBox, background, centred artwork. */
function applyArtboard(root: Element, fit: ArtboardFit, background: string): void {
  root.setAttribute("viewBox", fit.viewBox);
  root.setAttribute("width", fmt(fit.artW));
  root.setAttribute("height", fmt(fit.artH));
  const doc = root.ownerDocument;
  const group = doc.createElementNS(SVG_NS, "g");
  const scale = fit.scale === 1 ? "" : ` scale(${fmt(fit.scale)})`;
  group.setAttribute("transform", `translate(${fmt(fit.offsetX)} ${fmt(fit.offsetY)})${scale}`);
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
  // Fill ONLY: `stroke` is inherited, so an artwork that strokes on the root
  // (or a group) would otherwise paint a border around the whole artboard.
  rect.setAttribute("stroke", "none");
  return rect;
}

function name(el: Element): string {
  return el.nodeName.toLowerCase();
}
