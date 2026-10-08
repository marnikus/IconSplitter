// geom.ts — the export geometry policy of the "SVG to upload" tab
// (RULE 1/3): units with a documented DPI, the padded artboard fit, and the
// integer JPEG target dimensions. Document bounds come from lib/upload/geom/bounds.
//
// Units: SVG user units are CSS px at 96 DPI, and 1 pt = 1/72 in, so
// 1 pt = 96/72 px = 4/3 px. A configured "2.2 pt" stroke is therefore 2.93 px
// in the export's user units — never a silent "2.2 px" (design §2.10).
//
// Fit: padding is uniform on all four sides; fixed boards scale uniformly and
// center the art, never stretch or crop (design §2.11). The JPEG renders the
// final viewBox at its target resolution, preserving that board's ratio.

import type { Bounds } from "./geom/bounds";

// One import surface for the feature: document bounds live in lib/upload/geom/bounds,
// the export policy (units/fit/MP) lives here.
export { visibleBounds } from "./geom/bounds";
export type { Bounds, BoundsResult } from "./geom/bounds";

export const SVG_DPI = 96;
export const PT_PER_INCH = 72;

/** pt → px at the documented 96 DPI. */
export function ptToPx(pt: number): number {
  return (pt * SVG_DPI) / PT_PER_INCH;
}

/** px → pt at the documented 96 DPI. */
export function pxToPt(px: number): number {
  return (px * PT_PER_INCH) / SVG_DPI;
}

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

export interface ArtboardDimensions {
  width: number;
  height: number;
}

export interface ArtboardFit {
  /** The export viewBox: `0 0 artW artH` in user units (px at 96 DPI). */
  viewBox: string;
  artW: number;
  artH: number;
  /** Uniform scale applied to source artwork (1 for content-sized Fit). */
  scale: number;
  /** Translation applied to the artwork group after scaling. */
  offsetX: number;
  offsetY: number;
  /** Uniform padding actually applied (output-board user units). */
  pad: number;
}

interface FitPlacement {
  scale: number;
  offsetX: number;
  offsetY: number;
  pad: number;
}

/** Content-sized Fit or proportional fit to an exact pixel board. */
export function fitArtboard(bounds: Bounds, paddingPct: number, target?: ArtboardDimensions): ArtboardFit {
  return target === undefined ? fitContent(bounds, paddingPct) : fitFixed(bounds, paddingPct, target);
}

function fitContent(bounds: Bounds, paddingPct: number): ArtboardFit {
  const pad = (Math.max(bounds.width, bounds.height) * Math.max(0, paddingPct)) / 100;
  const artW = bounds.width + 2 * pad;
  const artH = bounds.height + 2 * pad;
  return makeFit(artW, artH, { scale: 1, offsetX: pad - bounds.minX, offsetY: pad - bounds.minY, pad });
}

function fitFixed(bounds: Bounds, paddingPct: number, target: ArtboardDimensions): ArtboardFit {
  const artW = Math.max(1, target.width);
  const artH = Math.max(1, target.height);
  const rawPad = (Math.max(artW, artH) * Math.max(0, paddingPct)) / 100;
  const pad = Math.min(rawPad, (Math.min(artW, artH) - 1) / 2);
  const innerW = artW - 2 * pad;
  const innerH = artH - 2 * pad;
  const scale = Math.min(innerW / bounds.width, innerH / bounds.height);
  const offsetX = pad + (innerW - bounds.width * scale) / 2 - bounds.minX * scale;
  const offsetY = pad + (innerH - bounds.height * scale) / 2 - bounds.minY * scale;
  return makeFit(artW, artH, { scale, offsetX, offsetY, pad });
}

function makeFit(artW: number, artH: number, placement: FitPlacement): ArtboardFit {
  return { viewBox: `0 0 ${fmt(artW)} ${fmt(artH)}`, artW, artH, ...placement };
}

export interface TargetSize {
  width: number;
  height: number;
  /** The real pixel count in megapixels (width × height / 1e6). */
  megapixels: number;
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
