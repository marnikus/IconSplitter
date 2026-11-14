// herosize.ts — resize the banner icon and its circle together (2026-11-14).
// "Both" follows the icon's size %: moving it to v sets the icon to v and the
// circle by the same factor, so their ratio stays (each clamped to its range).
import { RANGES, clampTo } from "./ranges";
import type { SheetConfig } from "./types";

type Banner = SheetConfig["banner"];

/** The value the "Both" control shows: the icon's size %. */
export function bothScale(banner: Banner): number {
  return banner.heroScale;
}

/** The icon at `value` %, the circle scaled by the same factor. */
export function withBothScale(banner: Banner, value: number): Pick<Banner, "heroScale" | "ringScale"> {
  const heroScale = clampTo(RANGES.heroScale, value);
  const factor = heroScale / Math.max(1, banner.heroScale);
  return { heroScale, ringScale: clampTo(RANGES.ringScale, Math.round(banner.ringScale * factor)) };
}
