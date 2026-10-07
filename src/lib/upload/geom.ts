// geom.ts — the export geometry policy of the "SVG to upload" tab
// (RULE 1/3): units with a documented DPI, the padded artboard fit, and the
// integer JPEG target dimensions. Document bounds come from lib/upload/geom/bounds.
//
// Units: SVG user units are CSS px at 96 DPI, and 1 pt = 1/72 in, so
// 1 pt = 96/72 px = 4/3 px. A configured "2.2 pt" stroke is therefore 2.93 px
// in the export's user units — never a silent "2.2 px" (design §2.10).
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

export interface ArtboardFit {
  /** The export viewBox: `0 0 artW artH` in user units (px at 96 DPI). */
  viewBox: string;
  artW: number;
  artH: number;
  /** Translation applied to the artwork group: pad − bounds origin. */
  offsetX: number;
  offsetY: number;
  /** Uniform padding actually applied (user units). */
  pad: number;
  /** Final intrinsic size in px (`width`/`height` attributes). */
  outW: number;
  outH: number;
}

/** Padded artboard around the visible bounds; content centred, scale 1. */
export function fitArtboard(bounds: Bounds, paddingPct: number): ArtboardFit {
  const pad = (Math.max(bounds.width, bounds.height) * Math.max(0, paddingPct)) / 100;
  const artW = bounds.width + 2 * pad;
  const artH = bounds.height + 2 * pad;
  return {
    viewBox: `0 0 ${fmt(artW)} ${fmt(artH)}`,
    artW, artH,
    offsetX: pad - bounds.minX,
    offsetY: pad - bounds.minY,
    pad, outW: artW, outH: artH,
  };
}

/**
 * Padded artboard expanded to the target's aspect, then sized to the target
 * px. The padded content is centred in the expanded viewBox by translation
 * only — never stretched, never cropped. `outW`/`outH` are the `width`/
 * `height` attributes; `artW`/`artH` stay in user units for the JPEG ratio.
 */
export function fitArtboardToSize(bounds: Bounds, paddingPct: number, targetW: number, targetH: number): ArtboardFit {
  const base = fitArtboard(bounds, paddingPct);
  const tW = targetW > 0 ? targetW : 1;
  const tH = targetH > 0 ? targetH : 1;
  const want = tW / tH;
  const have = base.artW / base.artH;
  if (Math.abs(have - want) < 1e-9) return { ...base, outW: tW, outH: tH };
  const expanded = have > want ? growHeight(base, want) : growWidth(base, want);
  return { ...expanded, outW: tW, outH: tH };
}

function growHeight(base: ArtboardFit, want: number): ArtboardFit {
  const artH = base.artW / want;
  const shift = (artH - base.artH) / 2;
  return { ...base, artH, viewBox: `0 0 ${fmt(base.artW)} ${fmt(artH)}`, offsetY: base.offsetY + shift };
}

function growWidth(base: ArtboardFit, want: number): ArtboardFit {
  const artW = base.artH * want;
  const shift = (artW - base.artW) / 2;
  return { ...base, artW, viewBox: `0 0 ${fmt(artW)} ${fmt(base.artH)}`, offsetX: base.offsetX + shift };
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
