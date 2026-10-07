// upfit.ts — the artboard, fit and stroke-sizing math (prompt §5/§7).
// Owns: the 1000-unit artboard (square default, or the content's own aspect),
// uniform padding, the proportional scale that centres without stretching or
// cropping, the integer raster dimensions for a target megapixel count, and
// the ONE pt→unit rule: the configured stroke is the physical stroke of the
// output JPEG at its rendered resolution (1 pt = 96/72 px at the reference
// DPI), so the exported SVG, the JPEG and the EPS agree visually and the EPS
// setlinewidth is exactly the configured pt value.

import type { Bounds } from "./upgeom";
import { STROKE_REF_DPI } from "./upsettings";

/** The artboard's long side, in artboard units. */
export const ARTBOARD_UNITS = 1000;

export interface FitPlan {
  artboard: { w: number; h: number };
  /** User units → artboard units. */
  scale: number;
  /** Where the scaled content sits, in artboard units. */
  translate: { x: number; y: number };
  bounds: Bounds;
}

export interface FitOpts {
  paddingPct: number;
  artboard: "square" | "fit";
}

const EPSILON = 1e-9;

export function fitPlan(bounds: Bounds, o: FitOpts): FitPlan {
  const bw = Math.max(bounds.maxX - bounds.minX, 0);
  const bh = Math.max(bounds.maxY - bounds.minY, 0);
  const artboard = artboardOf(bw, bh, o.artboard);
  const avail = Math.max(0, (100 - 2 * o.paddingPct)) / 100;
  const scale = Math.min(
    (artboard.w * avail) / Math.max(bw, EPSILON),
    (artboard.h * avail) / Math.max(bh, EPSILON),
  );
  return {
    artboard,
    scale,
    translate: {
      x: (artboard.w - bw * scale) / 2 - bounds.minX * scale,
      y: (artboard.h - bh * scale) / 2 - bounds.minY * scale,
    },
    bounds,
  };
}

/** Square default; "fit" keeps the content's aspect with the long side at 1000. */
function artboardOf(bw: number, bh: number, mode: "square" | "fit"): { w: number; h: number } {
  if (mode === "square") return { w: ARTBOARD_UNITS, h: ARTBOARD_UNITS };
  const long = Math.max(bw, bh, EPSILON);
  return { w: ARTBOARD_UNITS * Math.max(bw / long, EPSILON), h: ARTBOARD_UNITS * Math.max(bh / long, EPSILON) };
}

export interface RasterSize {
  width: number;
  height: number;
}

/** Integer dimensions whose product is the closest match ≥ the target MP. */
export function rasterSize(plan: FitPlan, mpx: number): RasterSize {
  const target = Math.max(1, mpx * 1e6);
  const ratio = plan.artboard.w / Math.max(plan.artboard.h, EPSILON);
  const height = Math.max(1, Math.round(Math.sqrt(target / ratio)));
  const width = Math.max(1, Math.round(height * ratio));
  return { width, height };
}

/** The honest megapixel count of the actual dimensions (shown to the user). */
export function actualMpx(r: RasterSize): number {
  return (r.width * r.height) / 1e6;
}

/** Raster pixels per artboard unit. */
export function pxPerArtboardUnit(plan: FitPlan, raster: RasterSize): number {
  return raster.width / Math.max(plan.artboard.w, EPSILON);
}

/** The configured stroke, expressed in artboard units. */
export function strokeInArtboardUnits(strokePt: number, plan: FitPlan, raster: RasterSize): number {
  return (strokePt * (STROKE_REF_DPI / 72)) / pxPerArtboardUnit(plan, raster);
}

/** The stroke width to write on an element, in its own user units. */
export function strokeInUserUnits(
  strokePt: number, plan: FitPlan, raster: RasterSize, s: { fitScale: number; elemScale: number },
): number {
  const denom = Math.max(s.fitScale * s.elemScale, EPSILON);
  return strokeInArtboardUnits(strokePt, plan, raster) / denom;
}

/** PostScript points per artboard unit: the JPEG's 96-DPI physical size. */
export function EPS_UNITS_PER_ARTBOARD_UNIT(raster: RasterSize): number {
  return (raster.width * (72 / STROKE_REF_DPI)) / ARTBOARD_UNITS;
}
