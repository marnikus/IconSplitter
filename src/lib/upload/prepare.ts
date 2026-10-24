import { repairStrokeFrame } from "./viewrepair";
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
// "Default" settings (2026-10-19, lib/upload/asis): a default padding fits the
// source's own viewBox (its margins) in ONE pass, a default artboard is the
// source viewBox size, a default background adds no rect — and all of them at
// once is AS IS: the approved text is returned untouched (no clean, no bake).

import { artboardTarget, BACKGROUND_SOURCE, isTransparent, megapixelTargetOf, readPaint, TRANSPARENT, type UploadSettings } from "./settings";
import { isAsIs } from "./asis";
import { appendCornerBadge } from "./cornerbadge";
import { appendSizeGuide } from "./sizeguide";
import { overflowsSourceFrame, placeArtwork, shippedBounds } from "./place";
import { cleanExportDom, unsupportedContent } from "./clean";
import { visibleBounds, type Bounds } from "./geom/bounds";
import { unifyStrokes, type GlobalStroke } from "./strokeglobal";

import { strokeStyleOf } from "./restyle";
import { fmt, parseSvgLength, type ArtboardFit, type FitTarget } from "./geom";

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
  /** Visible strokes turned into filled shapes, the size guide and badge handles included (0 unless `expandStrokes` is on). */
  strokesExpanded: number;
  /** The background the export paints: `transparent` or the normalized hex. */
  background: string;
  /** What the root defines once (`stroke`, `stroke-width`); null = per shape, or nothing strokes. */
  globalStroke: GlobalStroke;
  /** Placement passes it took to settle the shipped artwork in its artboard (1 = the first fit was exact; 0 = as is). */
  passes: number;
  /** Every visual setting at "default": `svg` IS the approved source text (2026-10-19). */
  asIs: boolean;
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
  const same = isAsIs(settings) ? asIsPrepared(sourceSvg, root) : null;
  if (same !== null) return same;
  const veto = sourceVeto(root);
  if (veto !== null) return veto;
  const frame = viewBoxOf(root) ?? sizeOf(root); // capture width/height before clean removes them
  cleanExportDom(root as Element, { keepRootEmbeds: false });
  const vb = visibleBounds(root);
  if (vb !== null && vb.unsupported.length > 0) {
    return fail("unsupported", `unsupported content: ${vb.unsupported.join(", ")}`);
  }
  if (vb === null) return fail("no-geometry", "the document has no visible geometry");
  const shade = shadowSourceFrame(root, frame, settings.shadowEnabled);
  if (shade.failure !== null) return shade.failure;
  return buildExport(doc, root, settings, shade.frame);
}

/** Repair minor cap overflow, but do not reveal genuinely clipped geometry. */
function shadowSourceFrame(root: Element, frame: Bounds | null, enabled: boolean): { frame: Bounds | null; failure: PrepareFailure | null } {
  if (!enabled) return { frame, failure: null };
  const repaired = repairStrokeFrame(root, frame);
  if (repaired === null || !overflowsSourceFrame(root, repaired)) return { frame: repaired, failure: null };
  return { frame, failure: fail("unsupported", "source paint extends outside its viewBox/viewport; a shadow cannot preserve the original clipping") };
}

/** Place → artboard → strokes defined once → re-rooted: the export copy of a cleaned, measurable source. */
function buildExport(doc: Document, root: Element, settings: UploadSettings, frame: Bounds | null): PrepareResult {
  const placed = placeArtwork(root, {
    paddingPct: settings.paddingPct ?? 0, target: targetOf(settings, frame),
    style: strokeStyleOf(settings), expand: settings.expandStrokes,
    frame: settings.paddingPct === null ? frame : null,
    shadow: settings.shadowEnabled ? { widthPct: settings.shadowWidthPct, gapPct: settings.shadowGapPct } : undefined,
  });
  if (!placed.ok) return fail(placed.code, placed.detail);
  const background = backgroundOf(settings.background);
  const boardRect = applyArtboard(placed.root, placed.fit, background);
  const globalStroke = unifyStrokes(placed.root); // the artboard rect included: it says `stroke="none"` only when the root hoists a paint
  // The shadow is explicitly stroke-free even if the source has no strokes to hoist.
  placed.shadow?.setAttribute("stroke", "none");
  const guide = sizeGuideStageOf(placed.root, settings, placed.shadow, boardRect);
  if (guide.failure !== null) return guide.failure;
  const badge = badgeStageOf(placed.root, settings);
  if (badge.failure !== null) return badge.failure;
  doc.replaceChild(placed.root, root);
  return {
    ok: true,
    svg: new XMLSerializer().serializeToString(doc),
    fit: placed.fit, bounds: placed.bounds, background, globalStroke, passes: placed.passes,
    shapesBaked: placed.shapesBaked, strokesNormalized: placed.widths, strokesRecolored: placed.colors,
    strokesExpanded: placed.expanded + guide.expanded + badge.expanded, asIs: false,
  };
}

interface Stage { failure: PrepareFailure | null; expanded: number }

/**
 * The size guide repeats the FINISHED icon (its own artboard rect and shadow
 * excluded), so it is staged after the stroke hoist and before the badge:
 * each repeat carries its own stroke definition and never inherits the root's.
 */
function sizeGuideStageOf(root: Element, settings: UploadSettings, shadow: Element | undefined, boardRect: Element | null): Stage {
  if (!settings.sizeGuideEnabled) return { failure: null, expanded: 0 };
  const board = viewBoxOf(root);
  if (board === null) return { failure: fail("no-fit", "the final artboard has no room for the size guide"), expanded: 0 };
  const icon = iconSnapshot(root, boardRect, shadow);
  const bounds = shippedBounds(icon);
  if (bounds === null || bounds.width <= 0) {
    return { failure: fail("no-fit", "the placed icon has no measurable geometry to repeat"), expanded: 0 };
  }
  const widthPx = (px: number) => (px > 0 ? px : null);
  const guide = appendSizeGuide(root, { width: board.width, height: board.height }, {
    icon, bounds, expand: settings.expandStrokes, color: null,
    strokePx: { small: widthPx(settings.sizeGuideSmallStrokePx), large: widthPx(settings.sizeGuideLargeStrokePx) },
  }, {
    corner: settings.sizeGuideCorner,
    offsetXPct: settings.sizeGuideOffsetXPct, offsetYPct: settings.sizeGuideOffsetYPct,
    smallPct: settings.sizeGuideSmallPct, largePct: settings.sizeGuideLargePct,
    gapPct: settings.sizeGuideGapPct,
  });
  return guide.ok
    ? { failure: null, expanded: guide.expanded }
    : { failure: fail(guide.code, guide.detail), expanded: 0 };
}

/** The placed icon alone: the root's own attributes (the hoisted stroke) and its children, minus the artboard and shadow. */
function iconSnapshot(root: Element, boardRect: Element | null, shadow: Element | undefined): Element {
  const snapshot = root.cloneNode(false) as Element;
  for (const child of Array.from(root.children)) {
    if (child === boardRect || child === shadow) continue;
    snapshot.appendChild(child.cloneNode(true));
  }
  return snapshot;
}

interface BadgeStage { failure: PrepareFailure | null; expanded: number }

/** An artboard decoration cannot affect the icon fit or the stroke hoist; its own handles expand when asked. */
function badgeStageOf(root: Element, settings: UploadSettings): BadgeStage {
  if (!settings.badgeEnabled) return { failure: null, expanded: 0 };
  const board = viewBoxOf(root);
  if (board === null) return { failure: fail("no-fit", "the final artboard has no room for the corner badge"), expanded: 0 };
  const badge = appendCornerBadge(root, { width: board.width, height: board.height }, {
    templateSvg: settings.badgeTemplateSvg,
    corner: settings.badgeCorner, widthPct: settings.badgeWidthPct, strokeLinecap: settings.strokeLinecap,
    offsetXPct: settings.badgeOffsetXPct, offsetYPct: settings.badgeOffsetYPct,
  }, settings.expandStrokes);
  return badge.ok
    ? { failure: null, expanded: badge.expanded }
    : { failure: fail(badge.code, badge.detail), expanded: 0 };
}

/** As is: the source text itself, framed by its own viewBox (or px size); null = no readable frame, so the pipeline decides. */
function asIsPrepared(sourceSvg: string, root: Element | null): PrepareResult | null {
  if (root === null || name(root) !== "svg") return null;
  const frame = viewBoxOf(root) ?? sizeOf(root);
  if (frame === null) return null;
  const fit: ArtboardFit = {
    viewBox: `${fmt(frame.minX)} ${fmt(frame.minY)} ${fmt(frame.width)} ${fmt(frame.height)}`,
    artW: frame.width, artH: frame.height, offsetX: -frame.minX, offsetY: -frame.minY, pad: 0, scale: 1,
  };
  return {
    ok: true, svg: sourceSvg, fit, bounds: frame, background: BACKGROUND_SOURCE, globalStroke: { stroke: null, strokeWidth: null }, passes: 0,
    shapesBaked: 0, strokesNormalized: 0, strokesRecolored: 0, strokesExpanded: 0, asIs: true,
  };
}

/** The root's viewBox as bounds; null when absent or degenerate. */
function viewBoxOf(root: Element): Bounds | null {
  const n = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return null;
  return { minX: n[0], minY: n[1], width: n[2], height: n[3] };
}

/** A root with only a px width/height: the frame at the origin. */
function sizeOf(root: Element): Bounds | null {
  const w = parseSvgLength(root.getAttribute("width"));
  const h = parseSvgLength(root.getAttribute("height"));
  return w !== null && h !== null && w > 0 && h > 0 ? { minX: 0, minY: 0, width: w, height: h } : null;
}

/** A default artboard is the source viewport size (viewBox or px dimensions); otherwise pinned px or MP. */
function targetOf(settings: UploadSettings, frame: Bounds | null): FitTarget | null {
  if (settings.artboard.mode === "source") return frame === null ? null : { width: frame.width, height: frame.height };
  return artboardTarget(settings.artboard, megapixelsOf(settings));
}

function backgroundOf(value: string): string {
  return value === BACKGROUND_SOURCE ? BACKGROUND_SOURCE : readPaint(value, TRANSPARENT) ?? TRANSPARENT;
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
function applyArtboard(root: Element, fit: ArtboardFit, background: string): Element | null {
  root.setAttribute("viewBox", fit.viewBox);
  root.removeAttribute("width");
  root.removeAttribute("height");
  if (background === BACKGROUND_SOURCE) return null; // "default": the source's own background, no artboard object
  const rect = artboardRect(root.ownerDocument, fit, background);
  root.insertBefore(rect, root.firstChild);
  return rect;
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
