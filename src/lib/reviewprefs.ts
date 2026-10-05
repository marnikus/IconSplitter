// reviewprefs.ts — persisted view preferences for Selection review V2
// (spec V2 §2 view modes, §4 thumbnail zoom; RULE 13). Owns the zoom range
// and the stored payload shape: values are clamped and validated on read, so
// a corrupt or hand-edited payload costs one ignored load, never a broken
// panel. The localStorage read/write lives in src/selectionv2/prefsstore.ts.

import { isRecord } from "./isrecord";

export const THUMB_MIN = 48;
/** One maximum for both tabs: Selection V2 and Generate SVG share this range. */
export const THUMB_MAX = 800;
export const THUMB_STEP = 4;
export const THUMB_DEFAULT = 84;

export type ViewMode = "list" | "compare";

/** Detail-view scaling for a single pair (Selection review V1). */
export type ZoomMode = "fit" | "full";

export interface ReviewPrefs {
  mode: ViewMode;
  thumbHeight: number;
}

export const DEFAULT_PREFS: ReviewPrefs = { mode: "list", thumbHeight: THUMB_DEFAULT };

/** Clamps a zoom value into the slider range and snaps it onto its step. */
export function clampThumb(value: number): number {
  if (!Number.isFinite(value)) return THUMB_DEFAULT;
  const snapped = Math.round(value / THUMB_STEP) * THUMB_STEP;
  return Math.min(THUMB_MAX, Math.max(THUMB_MIN, snapped));
}

/**
 * Display height for a thumbnail: the slider value, but never upscaled past
 * the source pixels once they are known (spec V2 §4).
 */
export function thumbHeight(maxPx: number, naturalHeight: number): number {
  return naturalHeight > 0 ? Math.min(maxPx, naturalHeight) : maxPx;
}

/** The box one thumbnail occupies, in px — what the slider really sets. */
export interface ThumbSize {
  width: number;
  height: number;
}

/**
 * The box a raster thumbnail occupies: the slider value as its height, but
 * never upscaled past the source's own pixels, and its width from that source's
 * aspect ratio. While the natural size is not known yet (still loading, or a
 * side that is missing) the box is the honest square the value names.
 */
export function thumbBox(maxPx: number, natural: { width: number; height: number }): ThumbSize {
  const height = thumbHeight(maxPx, natural.height);
  if (natural.width <= 0 || natural.height <= 0) return { width: height, height };
  return { width: Math.round((height * natural.width) / natural.height), height };
}

/**
 * The box an SVG preview occupies: a vector scales to the full slider height —
 * there are no source pixels to protect — and its width comes from the
 * document's own viewBox ratio. An unusable ratio falls back to a square.
 */
export function vectorThumbBox(maxPx: number, ratio: number): ThumbSize {
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return { width: Math.round(maxPx * r), height: maxPx };
}

/** Readout shown beside the slider, e.g. "128 px". */
export function thumbLabel(px: number): string {
  return `${px} px`;
}

export function serializePrefs(p: ReviewPrefs): string {
  return JSON.stringify(p);
}

/** Stored payload → prefs; anything unusable falls back to the defaults. */
export function parsePrefs(text: string | null): ReviewPrefs {
  return parsePrefsValue(readObject(text));
}

/** Same validation for an in-memory value (a history entry being re-applied). */
export function parsePrefsValue(raw: unknown): ReviewPrefs {
  if (!isRecord(raw)) return DEFAULT_PREFS;
  return { mode: toMode(raw.mode), thumbHeight: clampThumb(Number(raw.thumbHeight ?? THUMB_DEFAULT)) };
}

function toMode(value: unknown): ViewMode {
  return value === "compare" ? "compare" : "list";
}

function readObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const data: unknown = JSON.parse(text);
    return isRecord(data) ? data : null;
  } catch {
    return null; // corrupt payload: defaults win, never a crash (RULE 13)
  }
}
