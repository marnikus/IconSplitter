// target.ts — the 15.1 MP JPEG dimensions (design §7, request §7).
// Pure arithmetic, because the request is precise and the numbers are recorded:
// integer width/height, the icon's own ratio kept to within a pixel of rounding,
// the area never below the target, and — when a canvas limit makes the target
// unreachable — the shortfall REPORTED instead of hidden. The raster module
// turns these two integers into pixels; the export JSON stores them plus the
// actual megapixels.

/** The requested resolution: 15.1 million pixels. */
export const JPEG_TARGET_MP = 15.1;

/** Chromium's largest canvas side; a wider image cannot be encoded at all. */
export const MAX_CANVAS_DIM = 16_384;

export interface JpegDims {
  width: number;
  height: number;
  /** Actual megapixels, three decimals — what the JSON reports. */
  mp: number;
  /** True when the canvas limit forced a smaller image than requested. */
  clamped: boolean;
}

/** Megapixels of a pixel count, rounded for display and for the JSON. */
export function mpOf(width: number, height: number): number {
  const px = Math.max(0, width) * Math.max(0, height);
  return Math.round((px / 1_000_000) * 1000) / 1000;
}

/**
 * The dimensions to rasterise at: square for the default square artboard, and
 * the icon's own proportions otherwise. The width is rounded up where it must
 * be, so the area is never below the target; the height follows the ratio so the
 * image is never distorted.
 */
export function jpegTarget(targetMp: number = JPEG_TARGET_MP, ratio = 1): JpegDims {
  const mp = Number.isFinite(targetMp) && targetMp > 0 ? targetMp : JPEG_TARGET_MP;
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  let width = Math.ceil(Math.sqrt(mp * 1_000_000 * r));
  let height = Math.round(width / r);
  // A rounding pair can land a hair under the target: one pixel of width fixes
  // it, and the ratio stays within a pixel either way.
  if (width * height < mp * 1_000_000) width += 1;
  const clamped = width > MAX_CANVAS_DIM || height > MAX_CANVAS_DIM;
  if (clamped) ({ width, height } = shrinkToCanvas(width, height));
  return { width: Math.max(1, width), height: Math.max(1, height), mp: mpOf(width, height), clamped };
}

/** Both sides inside the canvas limit, the ratio kept: the honest fallback. */
function shrinkToCanvas(width: number, height: number): { width: number; height: number } {
  const factor = MAX_CANVAS_DIM / Math.max(width, height);
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
  };
}
