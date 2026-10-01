// reviewthumb.ts — thumbnail zoom model for the review list (RULE 3/8/13).
// Owns: slider bounds, max-height geometry (aspect preserved, never upscaled
// past source pixels), and validated persistence of the chosen height.

export const THUMB_MIN = 48;
export const THUMB_MAX = 240;
export const THUMB_DEFAULT = 128;
export const THUMB_STORE_KEY = "iconSplitter.sel.thumbH.v1";

/** Slider + stored-value sanity: finite numbers clamp into 48–240 px. */
export function clampThumbH(px: number): number {
  if (!Number.isFinite(px)) return THUMB_DEFAULT;
  return Math.min(THUMB_MAX, Math.max(THUMB_MIN, Math.round(px)));
}

export interface ThumbBox {
  w: number;
  h: number;
}

/**
 * Render box for one thumbnail: height ≤ maxH and ≤ natural height (small
 * sources never upscale); width follows the exact aspect ratio. Unknown dims
 * fall back to a square placeholder of the requested height.
 */
export function thumbBox(natural: ThumbBox | null, maxH: number): ThumbBox {
  const h = clampThumbH(maxH);
  if (!natural || natural.w <= 0 || natural.h <= 0) return { w: h, h };
  const outH = Math.min(h, natural.h);
  return { w: Math.max(1, Math.round((natural.w / natural.h) * outH)), h: outH };
}

/** Storage-shaped port kept explicit so the model stays pure (RULE 3). */
export interface StoreLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Restores the persisted max-height; missing/garbage falls back (RULE 13). */
export function readThumbH(store: StoreLike): number {
  const raw = store.getItem(THUMB_STORE_KEY);
  if (raw === null) return THUMB_DEFAULT;
  return clampThumbH(Number(raw));
}

/** Persists a clamped max-height; returns what was stored. */
export function writeThumbH(store: StoreLike, px: number): number {
  const h = clampThumbH(px);
  store.setItem(THUMB_STORE_KEY, String(h));
  return h;
}
