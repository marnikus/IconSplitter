// preparebuild.ts — place → artboard → strokes-once → re-root: the export copy
// of a cleaned, measurable source, plus the shadow-frame repair and the two
// artboard decoration stages (2026-11-17, split out of prepare.ts).
import { measureViewportBounds } from "./viewportbounds";
import { repairStrokeFrame } from "./viewrepair";
import { appendCornerBadge } from "./cornerbadge";
import { appendSizeGuide } from "./sizeguide";
import { overflowsSourceFrame, placeArtwork, shippedBounds } from "./place";
import type { Bounds } from "./geom/bounds";
import { unifyStrokes } from "./strokeglobal";
import { hoistAroundShadow } from "./shadow";
import { strokeStyleOf } from "./restyle";
import { artboardTarget, BACKGROUND_SOURCE, isTransparent, megapixelTargetOf, readPaint, TRANSPARENT, type UploadSettings } from "./settings";
import { fmt, type ArtboardFit, type FitTarget } from "./geom";
import { viewBoxOf } from "./prepareframe";
import { fail, type PrepareFailure, type PrepareResult } from "./preparetypes";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Repair minor cap overflow, but do not reveal genuinely clipped geometry. */
export function shadowSourceFrame(root: Element, frame: Bounds | null, enabled: boolean): { frame: Bounds | null; failure: PrepareFailure | null } {
  if (!enabled || frame === null) return { frame, failure: null };
  const measured = measureViewportBounds(root, frame);
  const repaired = repairStrokeFrame(root, frame, measured);
  if (measured.unsupported.length === 0 && repaired !== null && !overflowsSourceFrame(root, repaired, measured.painted)) return { frame: repaired, failure: null };
  return { frame, failure: fail("unsupported", "source paint extends outside its viewBox/viewport; a shadow cannot preserve the original clipping") };
}

/** Place → artboard → strokes defined once → re-rooted: the export copy of a cleaned, measurable source. */
export function buildExport(doc: Document, root: Element, settings: UploadSettings, frame: Bounds | null): PrepareResult {
  const placed = placeArtwork(root, {
    paddingPct: settings.paddingPct ?? 0, target: targetOf(settings, frame),
    style: strokeStyleOf(settings), expand: settings.expandStrokes,
    frame: settings.paddingPct === null ? frame : null,
    shadow: settings.shadowEnabled ? { widthPct: settings.shadowWidthPct, gapPct: settings.shadowGapPct, templateSvg: settings.shadowTemplateSvg, expand: settings.expandStrokes } : undefined,
  });
  if (!placed.ok) return fail(placed.code, placed.detail);
  const background = backgroundOf(settings.background);
  const boardRect = applyArtboard(placed.root, placed.fit, background);
  // The artboard rect is included: it says `stroke="none"` only when the root hoists a paint. The bundled shadow is
  // explicitly stroke-free even if the source has no strokes to hoist; a user's shadow keeps its own stroke definition.
  const globalStroke = hoistAroundShadow(placed.root, placed.shadow, () => unifyStrokes(placed.root));
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

/** A default artboard is the source viewport size (viewBox or px dimensions); otherwise pinned px or MP. */
function targetOf(settings: UploadSettings, frame: Bounds | null): FitTarget | null {
  if (settings.artboard.mode === "source") return frame === null ? null : { width: frame.width, height: frame.height };
  return artboardTarget(settings.artboard, megapixelsOf(settings));
}

/** The "Scale to N MP" target that applies (I-62): null when off or when a pinned size decides. */
function megapixelsOf(settings: UploadSettings): number | null {
  return megapixelTargetOf(settings.artboard, settings.scaleToMegapixels, settings.artboardMegapixels);
}

function backgroundOf(value: string): string {
  return value === BACKGROUND_SOURCE ? BACKGROUND_SOURCE : readPaint(value, TRANSPARENT) ?? TRANSPARENT;
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

