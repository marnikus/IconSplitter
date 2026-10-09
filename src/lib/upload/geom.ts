// geom.ts — the export geometry policy of the "SVG to upload" tab
// (RULE 1/3): units with a documented DPI, the padded artboard fit, and the
// integer JPEG target dimensions. Document bounds come from lib/upload/geom/bounds.
//
// Units: SVG user units are CSS px at 96 DPI; a SOURCE length in pt/mm/in is
// read at that DPI (`parseSvgLength`). The export's own numbers — the artboard,
// the stroke width setting — are px, written as typed (2026-10-08): the file
// shows the number the user chose, no unit conversion between them.
//
// Fit: padding is a percent of the fitted artwork's LARGEST side, uniform on
// all four sides; the artwork is centred by translation only — never
// stretched, never cropped (design §2.11). The JPEG renders the artboard
// viewBox at the target resolution, so 1 user unit maps to width/artW px.

import type { Bounds } from "./geom/bounds";

// One import surface for the feature: document bounds live in lib/upload/geom/bounds,
// the export policy (units/fit/MP) lives here.
export { visibleBounds } from "./geom/bounds";
export type { Bounds, BoundsResult } from "./geom/bounds";

export interface TargetSize {
  width: number;
  height: number;
  /** The real pixel count in megapixels (width × height / 1e6). */
  megapixels: number;
}

export const SVG_DPI = 96;
export const PT_PER_INCH = 72;

const LENGTH_UNITS: Record<string, number> = {
  "": 1, px: 1, pt: SVG_DPI / PT_PER_INCH, pc: 16, in: SVG_DPI,
  cm: SVG_DPI / 2.54, mm: SVG_DPI / 25.4, q: SVG_DPI / 101.6,
};

/** An SVG length in px; "%" and unparseable values are not lengths → null. */
export function parseSvgLength(value: string | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  const m = /^\s*([-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value);
  if (m === null) return null;
  const factor = LENGTH_UNITS[m[2].toLowerCase()];
  if (factor === undefined) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n * factor : null;
}

export interface ArtboardFit {
  /** The export viewBox: `0 0 artW artH` in user units (px at 96 DPI). */
  viewBox: string;
  artW: number;
  artH: number;
  /** Translation applied to the artwork group. */
  offsetX: number;
  offsetY: number;
  /** Uniform padding actually applied (user units). */
  pad: number;
  /** How much the artwork is scaled: 1 when the artboard hugs the content. */
  scale: number;
}

/**
 * The padded artboard. Without `target` it hugs the artwork (scale 1, padding a
 * share of the artwork's largest side). With a pinned `target` the artboard IS
 * that size, padding is a share of ITS largest side, and the artwork is scaled
 * by the same factor on both axes to fit inside — centred, never stretched,
 * never cropped, so a non-square target letterboxes instead of distorting.
 * With a megapixel `target` (I-62) the artboard is the content fit scaled
 * uniformly so its area is N × 10⁶ px² — the same box, the same padding share.
 */
export function fitArtboard(bounds: Bounds, paddingPct: number, target?: FitTarget | null): ArtboardFit {
  const pct = Math.max(0, paddingPct);
  if (target === undefined || target === null) return contentFit(bounds, pct, 1);
  if ("megapixels" in target) return contentFit(bounds, pct, megapixelScale(bounds, pct, target.megapixels));
  const artW = Math.max(1, target.width);
  const artH = Math.max(1, target.height);
  const pad = (Math.max(artW, artH) * pct) / 100;
  const scale = fitScale(bounds, artW - 2 * pad, artH - 2 * pad);
  return {
    viewBox: `0 0 ${fmt(artW)} ${fmt(artH)}`, artW, artH,
    offsetX: (artW - bounds.width * scale) / 2 - bounds.minX * scale,
    offsetY: (artH - bounds.height * scale) / 2 - bounds.minY * scale,
    pad, scale,
  };
}

/** The content fit scaled by k: the box, its padding and the artwork all grow together. */
function contentFit(bounds: Bounds, pct: number, k: number): ArtboardFit {
  const pad = ((Math.max(bounds.width, bounds.height) * pct) / 100) * k;
  const artW = bounds.width * k + 2 * pad;
  const artH = bounds.height * k + 2 * pad;
  return {
    viewBox: `0 0 ${fmt(artW)} ${fmt(artH)}`, artW, artH,
    offsetX: pad - bounds.minX * k, offsetY: pad - bounds.minY * k, pad, scale: k,
  };
}

/** The uniform factor that makes the padded content fit's area N × 10⁶ px²; 1 when the fit has no area. */
function megapixelScale(bounds: Bounds, pct: number, megapixels: number): number {
  const unscaled = contentFit(bounds, pct, 1);
  const area = unscaled.artW * unscaled.artH;
  if (!(area > 0) || !(megapixels > 0)) return 1;
  return Math.sqrt((megapixels * 1e6) / area);
}

/** The exact px size a pinned artboard asks for. */
export interface PinnedSize {
  width: number;
  height: number;
}

/** An artboard area target: scale the content fit so artW × artH = megapixels × 10⁶. */
export interface MegapixelTarget {
  megapixels: number;
}

/** What `fitArtboard` fits into: an exact px size, an area, or nothing (hug the content). */
export type FitTarget = PinnedSize | MegapixelTarget;

/** Uniform factor that fits the bounds inside the box; 1 when the box is degenerate. */
function fitScale(bounds: Bounds, boxW: number, boxH: number): number {
  const usableW = Math.max(0, boxW);
  const usableH = Math.max(0, boxH);
  if (bounds.width <= 0 || bounds.height <= 0) return 1;
  const k = Math.min(usableW / bounds.width, usableH / bounds.height);
  return k > 0 ? k : 1;
}

/** The target size of a pinned artboard: integer px, exactly as configured. */
export function pinnedDimensions(target: PinnedSize): TargetSize {
  const width = Math.max(1, Math.round(target.width));
  const height = Math.max(1, Math.round(target.height));
  return { width, height, megapixels: (width * height) / 1e6 };
}

/**
 * Integer pixel dimensions whose product is as close as possible to
 * `megapixels` × 10⁶ while preserving the artboard's aspect ratio. A square
 * artboard at 15.1 MP lands on 3886 × 3886 = 15 100 996 px (15.10 MP).
 */
export function targetDimensions(artW: number, artH: number, megapixels: number): TargetSize {
  const w = artW > 0 ? artW : 1;
  const h = artH > 0 ? artH : 1;
  const scale = Math.sqrt((Math.max(0.001, megapixels) * 1e6) / (w * h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  return { width, height, megapixels: (width * height) / 1e6 };
}

/** 3-decimal trim: keeps export files small without losing visible precision. */
export function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}
