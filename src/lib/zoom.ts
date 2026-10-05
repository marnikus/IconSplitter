// zoom.ts — the ONE thumbnail zoom (I-55). Why one owner: Selection V2 and
// Generate SVG both preview a pair at a height the user picks, and the request
// says the two tabs must behave the same, so the range, the clamp and the SIZE
// RULE live here — the two prefs payloads persist the value, the two rows mount
// it. The rule is height-driven and aspect-preserving: an artwork keeps its own
// ratio (wide art gets a wider box, tall art a narrower one), a raster is never
// upscaled past its own pixels, and a vector is sized by its own ratio. Nothing
// caps the width: a wide pair at 800 px is honestly wide, and the list scrolls
// (a cap would be clipping by another name — the measured V2 defect).

export const ZOOM_MIN = 48;
export const ZOOM_MAX = 800;
export const ZOOM_STEP = 4;
export const ZOOM_DEFAULT = 84;

/** The box one preview occupies: real pixels, so nothing overlaps or is cut. */
export interface ZoomBox {
  width: number;
  height: number;
}

/** Clamps a zoom value into the range and snaps it onto its step. */
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_DEFAULT;
  const snapped = Math.round(value / ZOOM_STEP) * ZOOM_STEP;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, snapped));
}

/** Readout shown beside the slider, e.g. "128 px". */
export function zoomLabel(px: number): string {
  return `${px} px`;
}

/**
 * The box for a raster: the zoom value as the height (never taller than the
 * source), the width from the artwork's own ratio. Unknown pixels (before the
 * image decodes, or an unreadable file) give a square of the zoom value.
 */
export function zoomBox(maxH: number, natural: { w: number; h: number } | null): ZoomBox {
  if (natural === null || natural.w <= 0 || natural.h <= 0) return square(maxH);
  const height = Math.min(maxH, natural.h);
  return { width: boxWidth(height, natural.w / natural.h), height };
}

/** The box for a vector, whose ratio is known from its viewBox before drawing. */
export function zoomBoxRatio(maxH: number, ratio: number): ZoomBox {
  if (!Number.isFinite(ratio) || ratio <= 0) return square(maxH);
  return { width: boxWidth(maxH, ratio), height: maxH };
}

function square(px: number): ZoomBox {
  return { width: px, height: px };
}

function boxWidth(height: number, ratio: number): number {
  return Math.max(1, Math.round(height * ratio));
}
