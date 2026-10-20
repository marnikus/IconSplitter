// settingsnumbers.ts — validated numeric Upload settings and their public ranges.
export const PADDING_MIN = 0;
export const PADDING_MAX = 50;
export const PADDING_DEFAULT = 8;
export const STROKE_MIN = 0;
export const STROKE_MAX = 50;
export const STROKE_DEFAULT = 0;
export const MP_MIN = 1;
export const MP_MAX = 64;
export const MP_DEFAULT = 15.1;
export const ARTBOARD_MP_DEFAULT = 5;
export const QUALITY_MIN = 0.5;
export const QUALITY_MAX = 1;
export const QUALITY_DEFAULT = 0.92;
export const SHADOW_WIDTH_DEFAULT = 80;
export const SHADOW_WIDTH_MIN = 10;
export const SHADOW_WIDTH_MAX = 200;
export const SHADOW_GAP_DEFAULT = 5;
export const SHADOW_GAP_MIN = 0;
export const SHADOW_GAP_MAX = 100;

export const clampPaddingPct = (value: unknown) => clampNum(value, PADDING_MIN, PADDING_MAX, PADDING_DEFAULT);
export const clampStrokePx = (value: unknown) => clampNum(value, STROKE_MIN, STROKE_MAX, STROKE_DEFAULT);
export const clampMegapixels = (value: unknown) => clampNum(value, MP_MIN, MP_MAX, MP_DEFAULT);
export const clampArtboardMegapixels = (value: unknown) => clampNum(value, MP_MIN, MP_MAX, ARTBOARD_MP_DEFAULT);
export const clampQuality = (value: unknown) => clampNum(value, QUALITY_MIN, QUALITY_MAX, QUALITY_DEFAULT);
export const clampShadowWidthPct = (value: unknown) => clampNum(value, SHADOW_WIDTH_MIN, SHADOW_WIDTH_MAX, SHADOW_WIDTH_DEFAULT);
export const clampShadowGapPct = (value: unknown) => clampNum(value, SHADOW_GAP_MIN, SHADOW_GAP_MAX, SHADOW_GAP_DEFAULT);

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
