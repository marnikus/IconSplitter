// uploadartboard.ts — from an icon's visible bounds to the exact export copy
// (RULE 1/3). Owns: the padded/scaled artboard in user units, the INTEGER
// pixel size of the raster output at the configured megapixel target, the
// stroke width converted from its physical unit into both, and the surgery that
// builds the export SVG (new viewBox + px size, optional background plate,
// normalised stroke width). The approved source file is never touched: this
// produces a string held in memory. Nothing here is drawn — the rasteriser is
// told these numbers.

import type { Box } from "./svggeom";
import { parseSvg } from "./svgvalidate";
import { svgValue } from "./svgstyle";
import { unitToPx } from "./uploadunits";
import type { UploadSettings } from "./uploadsettings";
import type { BoundsResult } from "./uploadbounds";

/** Canvas size ceiling every engine accepts (Chrome/Firefox cap 16384 per side). */
export const MAX_PIXEL_SIDE = 16384;

export interface PixelSize {
  width: number;
  height: number;
  /** Achieved megapixels (width·height/1e6) — what the record reports. */
  mp: number;
}

export interface Artboard {
  /** The export's viewBox: the padded artboard, centred on the ink. */
  viewBox: Box;
  /** Exact integer raster size for this artboard. */
  px: PixelSize;
  /** User units per pixel (the same on both axes, apart from rounding). */
  unitsPerPx: number;
  /** Ink box inside the artboard, for the preview overlay. */
  ink: Box;
  /** Configured stroke width in output pixels (physical unit → px at DPI). */
  strokePx: number;
  /** The same width in artboard user units — what the SVG copy declares. */
  strokeUnits: number;
}

/** Integer pixel size for one aspect ratio at (at most) the target megapixels. */
export function pixelSize(aspect: number, targetMP: number): PixelSize {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const target = Math.max(1, Math.min(targetMP, 60) * 1e6);
  const height = Math.max(1, Math.round(Math.sqrt(target / safeAspect)));
  const width = Math.max(1, Math.min(MAX_PIXEL_SIDE, Math.round(height * safeAspect)));
  const cappedHeight = Math.min(MAX_PIXEL_SIDE, height);
  return { width, height: cappedHeight, mp: round3((width * cappedHeight) / 1e6) };
}

/** The artboard one icon exports on: padding and scale around the ink box. */
export function artboardFor(ink: Box, settings: UploadSettings): Artboard {
  const pad = 1 + (2 * settings.paddingPct) / 100;
  const scale = Math.max(0.01, settings.iconScalePct / 100);
  const longest = Math.max(ink.w, ink.h, 1e-3);
  const w = saneSide(Math.max(ink.w, longest * 0.01) * pad / scale);
  const h = settings.square ? w : saneSide(Math.max(ink.h, longest * 0.01) * pad / scale);
  const viewBox = centred(ink, w, h);
  const px = pixelSize(w / h, settings.targetMP);
  return {
    viewBox,
    px,
    unitsPerPx: w / px.width,
    ink: { ...ink },
    strokePx: round3(unitToPx(settings.strokeWidth, settings.strokeUnit, settings.dpi)),
    strokeUnits: 0,
  };
}

/** The artboard with its stroke width resolved (one place does the division). */
export function resolveStroke(artboard: Artboard): Artboard {
  const strokeUnits = artboard.strokePx * artboard.unitsPerPx;
  return { ...artboard, strokeUnits: round3(strokeUnits) };
}

/** A square artboard's side from the ink and the settings (the common case). */
export function artboardFromBounds(bounds: BoundsResult, settings: UploadSettings): Artboard {
  const ink = bounds.visible ?? bounds.viewBox;
  return resolveStroke(artboardFor(ink, settings));
}

export interface PreparedSvg {
  ok: boolean;
  error: string | null;
  code: string;
  artboard: Artboard | null;
  /** What the preparation could not do — surfaced on the row and in the record. */
  warnings: string[];
  /** How many elements got the configured stroke width. */
  strokesNormalised: number;
}

/**
 * Builds the export copy. Order matters: the viewBox and the px size are set
 * first (so every later number is in export units), then the background plate
 * goes in as the FIRST child (paint order), then the stroke width is applied.
 * A failing parse returns the reason — never a half-prepared document.
 */
export function prepareSvg(code: string, bounds: BoundsResult, settings: UploadSettings): PreparedSvg {
  const { doc, errors } = parseSvg(code);
  if (doc === null) {
    return { ok: false, error: errors[0] ?? "not usable as SVG", code: "", artboard: null, warnings: [], strokesNormalised: 0 };
  }
  const artboard = artboardFromBounds(bounds, settings);
  const root = doc.documentElement;
  applyArtboard(root, artboard);
  const plate = settings.backgroundInSvg ? paintBackground(doc, artboard, settings.background) : null;
  const strokesNormalised = settings.strokeWidth > 0 ? normaliseStrokes(root, artboard) : 0;
  return {
    ok: true,
    error: null,
    code: new XMLSerializer().serializeToString(root),
    artboard,
    warnings: preparationWarnings(bounds, settings, plate),
    strokesNormalised,
  };
}

function applyArtboard(root: Element, artboard: Artboard): void {
  root.setAttribute("viewBox", round4(artboard.viewBox));
  root.setAttribute("width", String(artboard.px.width));
  root.setAttribute("height", String(artboard.px.height));
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

/** The opaque plate behind the artwork; `data-export-plate` marks it for checks. */
function paintBackground(doc: Document, artboard: Artboard, colour: string): Element {
  const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
  const v = artboard.viewBox;
  rect.setAttribute("x", String(v.x));
  rect.setAttribute("y", String(v.y));
  rect.setAttribute("width", String(v.w));
  rect.setAttribute("height", String(v.h));
  rect.setAttribute("fill", colour);
  rect.setAttribute("data-export-plate", "1");
  doc.documentElement.insertBefore(rect, doc.documentElement.firstChild);
  return rect;
}

/**
 * The configured width, applied to every stroked element of the COPY. An
 * element with `vector-effect="non-scaling-stroke"` paints in device pixels, so
 * it receives the pixel width; every other element receives the user-unit width
 * (the same physical size once the artboard is rasterised at the declared DPI).
 */
function normaliseStrokes(root: Element, artboard: Artboard): number {
  let count = 0;
  for (const el of Array.from(root.getElementsByTagName("*"))) {
    if (!hasGeometry(el) || !paintsStroke(el)) continue;
    const nonScaling = svgValue(el, "vector-effect") === "non-scaling-stroke";
    el.setAttribute("stroke-width", String(nonScaling ? artboard.strokePx : artboard.strokeUnits));
    el.setAttribute("data-export-stroke", nonScaling ? "px" : "units");
    count += 1;
  }
  return count;
}

const SHAPES = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"];

function hasGeometry(el: Element): boolean {
  return SHAPES.includes(el.nodeName.toLowerCase());
}

/** The one reader for "which declaration wins" (inline style, then attribute). */
function paintsStroke(el: Element): boolean {
  const stroke = svgValue(el, "stroke");
  return stroke !== "" && stroke !== "none";
}

/** Everything the user must know about this preparation, in one list. */
function preparationWarnings(bounds: BoundsResult, settings: UploadSettings, plate: Element | null): string[] {
  return [
    ...(bounds.clipped ? ["artwork extends outside the source viewBox — the visible part was used"] : []),
    ...(bounds.effects.length > 0 ? [`effects cannot be measured here: ${bounds.effects.join(", ")}`] : []),
    ...(bounds.unmeasurable.length > 0 ? [`not measured: ${bounds.unmeasurable.join(", ")}`] : []),
    ...(settings.strokeWidth > 0 ? [] : ["stroke width 0 — the source strokes are kept"]),
    ...(plate === null ? ["background is not painted into the SVG (JPEG only)"] : []),
  ];
}

/** Keeps a side wide enough that rounding never collapses the artboard. */
function saneSide(side: number): number {
  return trim(Math.max(side, 1e-3));
}

function centred(ink: Box, w: number, h: number): Box {
  return {
    x: trim(ink.x + ink.w / 2 - w / 2),
    y: trim(ink.y + ink.h / 2 - h / 2),
    w: trim(w),
    h: trim(h),
  };
}

/** The viewBox attribute text — four trimmed numbers, as every reader expects. */
function round4(v: Box): string {
  return `${trim(v.x)} ${trim(v.y)} ${trim(v.w)} ${trim(v.h)}`;
}

function trim(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
