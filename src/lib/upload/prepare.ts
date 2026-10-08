// prepare.ts — the export SVG copy of the "SVG to upload" tab
// (RULE 1/3). The approved source is parsed, never modified; the export
// document is a re-rooted copy: viewBox = padded artboard (fitArtboard) — and
// ONLY the viewBox: the root carries no px width/height (stock review, 2026-10-08),
// the artwork translated to centre it, an explicit background rect painted
// first when the background is a colour (none when `transparent`), and — when
// a stroke width or a stroke colour is configured — every visible stroke
// restyled: the width normalized to that pt width in output px at 96 DPI and
// written tidy (lib/upload/geom/stroke), the paint set to the configured hex.
// Content the geometry math cannot answer for (text, image, geometry-restyle
// CSS, a transform on the root) fails the preparation honestly instead of being
// guessed. Clean code (2026-10-08) is part of the copy: SVG 1.1, a real
// viewBox, no raster, no `<style>`, and no ids, classes or editor bloat —
// see lib/upload/clean.

import {
  artboardSize, isTransparent, readPaint, STROKE_COLOR_ARTWORK, TRANSPARENT, type UploadSettings,
} from "./settings";
import { cleanExportDom, unsupportedContent } from "./clean";
import { scaleOf } from "./geom/matrix";
import { isShape, strokeHits, visibleBounds, type Bounds } from "./geom/bounds";
import { tidyStrokeWidth } from "./geom/stroke";
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
  /** Elements whose stroke paint was set (0 when strokeColor = artwork). */
  strokesRecolored: number;
  /** The background the export paints: `transparent` or the normalized hex. */
  background: string;
}

export type PrepareFailure = Extract<PrepareResult, { ok: false }>;
export type PrepareResult =
  | ({ ok: true } & PreparedSvg)
  | { ok: false; code: PrepareFailureCode; detail: string };

/** What the restyle pass writes onto every visible stroke; null = leave that aspect alone. */
interface StrokeStyle {
  /** The width in output px of the FINAL file (already divided by the artboard scale). */
  widthPx: number | null;
  color: string | null;
}

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
  const touched = restyleStrokes(root, strokeStyleOf(settings, fit));
  const background = readPaint(settings.background, TRANSPARENT) ?? TRANSPARENT;
  applyArtboard(root, fit, background);
  return {
    ok: true,
    svg: new XMLSerializer().serializeToString(doc),
    fit, bounds: vb.bounds, background,
    strokesNormalized: touched.widths, strokesRecolored: touched.colors,
  };
}

/**
 * The stroke width is a width in the FINAL file, so it is divided by the
 * artboard's scale as well: a 2.2 pt stroke stays 2.2 pt whatever size the
 * artboard pinned the artwork to. The colour is the configured hex, or nothing.
 */
function strokeStyleOf(settings: UploadSettings, fit: ArtboardFit): StrokeStyle {
  return {
    widthPx: settings.strokePt > 0 ? ptToPx(settings.strokePt) / fit.scale : null,
    color: settings.strokeColor === STROKE_COLOR_ARTWORK ? null : readPaint(settings.strokeColor, STROKE_COLOR_ARTWORK),
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

/** One walk over every visible stroke on a shape: width and/or paint, as configured. */
function restyleStrokes(root: Element, want: StrokeStyle): { widths: number; colors: number } {
  const touched = { widths: 0, colors: 0 };
  if (want.widthPx === null && want.color === null) return touched;
  for (const hit of strokeHits(root)) {
    if (hit.stroke.none || !isShape(hit.el)) continue;
    if (want.widthPx !== null) {
      const k = scaleOf(hit.ctm);
      setStrokeWidth(hit.el, k > 1e-9 ? want.widthPx / k : want.widthPx);
      touched.widths++;
    }
    if (want.color !== null) {
      setStrokeColor(hit.el, want.color);
      touched.colors++;
    }
  }
  return touched;
}

/** An explicit width wins over inherited and inline-style values; written tidy (stock review item 2). */
function setStrokeWidth(el: Element, width: number): void {
  stripStyleKeys(el, ["stroke-width", "vector-effect"]);
  el.setAttribute("stroke-width", fmt(tidyStrokeWidth(width)));
  el.removeAttribute("vector-effect");
}

/** An explicit paint wins over inherited and inline-style values. */
function setStrokeColor(el: Element, color: string): void {
  stripStyleKeys(el, ["stroke"]);
  el.setAttribute("stroke", color);
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

/** Re-roots the document: padded artboard viewBox (no px size), background, centred artwork. */
function applyArtboard(root: Element, fit: ArtboardFit, background: string): void {
  root.setAttribute("viewBox", fit.viewBox);
  root.removeAttribute("width");
  root.removeAttribute("height");
  const doc = root.ownerDocument;
  const group = doc.createElementNS(SVG_NS, "g");
  const scale = fit.scale === 1 ? "" : ` scale(${fmt(fit.scale)})`;
  group.setAttribute("transform", `translate(${fmt(fit.offsetX)} ${fmt(fit.offsetY)})${scale}`);
  for (const child of Array.from(root.children)) group.appendChild(child);
  root.appendChild(group);
  if (!isTransparent(background)) root.insertBefore(backgroundRect(doc, fit, background), group);
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
