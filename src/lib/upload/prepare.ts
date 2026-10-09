// prepare.ts — the export SVG copy of the "SVG to upload" tab
// (RULE 1/3). The approved source is parsed, never modified; the export
// document is a re-rooted copy built in two phases (2026-10-09, I-60):
//   clean   — SVG 1.1, a real viewBox, no raster, no `<style>`, no ids/classes/
//             editor bloat (lib/upload/clean); content the geometry math cannot
//             answer for (text, image, a root transform…) fails honestly;
//   place   — lib/upload/place: a CLONE is baked (every transform — the
//             artwork's own and the artboard's translate+scale — becomes
//             geometry, so the file has no `transform`), the configured stroke
//             is written VERBATIM in px (2026-10-08: "2 in the setting is 2 in
//             the SVG") and the configured hex, strokes are expanded when asked,
//             and the result is MEASURED as it ships: the artboard is the final
//             bounds plus the padding, nothing visible lies outside it.
// Then each stroke property is defined ONCE (lib/upload/strokeglobal) and the
// root is re-rooted: viewBox = the artboard — ONLY the viewBox, no px
// width/height (stock review, 2026-10-08) — and the artboard rect ALWAYS first:
// the background colour, or `fill="none"` when transparent (the artboard is an
// object of the artwork, "select all" in an editor is the artboard).

import { artboardTarget, isTransparent, megapixelTargetOf, readPaint, TRANSPARENT, type UploadSettings } from "./settings";
import { cleanExportDom, unsupportedContent } from "./clean";
import { visibleBounds, type Bounds } from "./geom/bounds";
import { unifyStrokes, type GlobalStroke } from "./strokeglobal";
import { placeArtwork } from "./place";
import { strokeStyleOf } from "./restyle";
import { fmt, type ArtboardFit } from "./geom";

const SVG_NS = "http://www.w3.org/2000/svg";

export type PrepareFailureCode = "parse" | "no-geometry" | "unsupported" | "no-fit";

export interface PreparedSvg {
  /** The export SVG text; the source document is never touched. */
  svg: string;
  fit: ArtboardFit;
  bounds: Bounds;
  /** Shapes whose coordinates were rewritten in artboard px (every transform spent). */
  shapesBaked: number;
  /** Elements whose stroke-width was set to the configured px (0 when strokePx = 0). */
  strokesNormalized: number;
  /** Elements whose stroke paint was set (0 when strokeColor = artwork). */
  strokesRecolored: number;
  /** Visible strokes turned into filled shapes (2026-10-09; 0 unless `expandStrokes` is on). */
  strokesExpanded: number;
  /** The background the export paints: `transparent` or the normalized hex. */
  background: string;
  /** What the root defines once (`stroke`, `stroke-width`); null = per shape, or nothing strokes. */
  globalStroke: GlobalStroke;
  /** Placement passes it took to settle the shipped artwork in its artboard (1 = the first fit was exact). */
  passes: number;
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
  const placed = placeArtwork(root, {
    paddingPct: settings.paddingPct, target: artboardTarget(settings.artboard, megapixelsOf(settings)),
    style: strokeStyleOf(settings), expand: settings.expandStrokes,
  });
  if (!placed.ok) return fail(placed.code, placed.detail);
  const background = readPaint(settings.background, TRANSPARENT) ?? TRANSPARENT;
  applyArtboard(placed.root, placed.fit, background);
  const globalStroke = unifyStrokes(placed.root); // the artboard rect included: it says `stroke="none"` only when the root hoists a paint
  doc.replaceChild(placed.root, root);
  return {
    ok: true,
    svg: new XMLSerializer().serializeToString(doc),
    fit: placed.fit, bounds: placed.bounds, background, globalStroke, passes: placed.passes,
    shapesBaked: placed.shapesBaked, strokesNormalized: placed.widths, strokesRecolored: placed.colors,
    strokesExpanded: placed.expanded,
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

/** The "Scale to N MP" target that applies (I-62): null when off or when a pinned size decides. */
function megapixelsOf(settings: UploadSettings): number | null {
  return megapixelTargetOf(settings.artboard, settings.scaleToMegapixels, settings.artboardMegapixels);
}

/** Re-roots the document: the artboard viewBox (no px size) and the artboard rect first — the artwork already sits in it. */
function applyArtboard(root: Element, fit: ArtboardFit, background: string): void {
  root.setAttribute("viewBox", fit.viewBox);
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.insertBefore(artboardRect(root.ownerDocument, fit, background), root.firstChild);
}

/** The artboard as an object: filled with the background colour, or invisible (`fill="none"`) when transparent. */
function artboardRect(doc: Document, fit: ArtboardFit, background: string): Element {
  const rect = doc.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "0");
  rect.setAttribute("y", "0");
  rect.setAttribute("width", fmt(fit.artW));
  rect.setAttribute("height", fmt(fit.artH));
  rect.setAttribute("fill", isTransparent(background) ? "none" : background);
  // Fill ONLY: `stroke` is inherited, so an artwork that strokes on the root
  // would otherwise paint a border around the whole artboard; the stroke
  // unification keeps this `none` exactly when the root carries a paint.
  rect.setAttribute("stroke", "none");
  return rect;
}

function name(el: Element): string {
  return el.nodeName.toLowerCase();
}
