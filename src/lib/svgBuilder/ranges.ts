// ranges.ts — the ONE range table for every numeric sheet setting. The parser
// clamps to it and every control reads its min/max/step from it, so a value
// the UI allows can never be silently reverted by the parser (FIXES A5/A6).
import type { BannerPosition } from "./types";

export interface NumRange { min: number; max: number; step: number }

const r = (min: number, max: number, step = 1): NumRange => ({ min, max, step });

/** Reference "Glyph" ranges (FIXES §C4). */
export const RANGES = {
  width: r(320, 3000), height: r(240, 3000), padding: r(0, 160), radius: r(0, 64),
  columns: r(1, 16), rows: r(1, 12), gapX: r(0, 60), gapY: r(0, 60), captionSize: r(5, 13),
  box: r(18, 120), strokeWidth: r(0.5, 5, 0.1),
  bannerSide: r(120, 420), bannerEdge: r(50, 180), bannerAny: r(50, 420),
  titleSize: r(10, 48), subtitleSize: r(5, 26), threshold: r(0, 100), textWeight: r(0, 100, 5),
} as const satisfies Record<string, NumRange>;

/** Rounds to the range's step, then clamps; a non-number yields `fallback`. */
export function clampTo(range: NumRange, value: unknown, fallback = range.min): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  const stepped = Math.round(n / range.step) * range.step;
  const decimals = range.step < 1 ? String(range.step).split(".")[1]?.length ?? 1 : 0;
  return Number(Math.min(range.max, Math.max(range.min, stepped)).toFixed(decimals));
}

/** Side banners are widths (120–420); top/bottom banners are heights (50–180). */
export function bannerRange(position: BannerPosition): NumRange {
  return position === "top" || position === "bottom" ? RANGES.bannerEdge : RANGES.bannerSide;
}
