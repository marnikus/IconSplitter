// rebalance.ts — ⇔ Rebalance row (2026-11-15): an edge (top / bottom) solid
// banner's row laid out with EQUAL gaps between the hero glyph, the title, the
// divider, the subtitle and both banner edges (banner.ts `edgeXs`, spread on).
// Each text gets the width of its own one line, and the manual moves and the
// text padding are cleared so the gaps are the only spacing. Pure.
import { RANGES, clampTo } from "./ranges";
import type { SheetConfig } from "./types";

type Banner = SheetConfig["banner"];

/** Only an edge banner in the solid style has one row of parts. */
export function canRebalance(banner: Pick<Banner, "position" | "style">): boolean {
  return (banner.position === "top" || banner.position === "bottom") && banner.style === "solid";
}

/** A box width that keeps `text` on one line (banner.ts wraps at width ÷ charWidth characters). */
function oneLine(text: string, charWidth: number): number {
  return Math.round(clampTo(RANGES.textWidth, Math.ceil(text.trim().length * charWidth) + 2));
}

export function rebalancedBanner(banner: Banner): Partial<Banner> {
  return {
    edgeSpread: true, textPadding: 0, titleDx: 0, titleDy: 0, subtitleDx: 0, subtitleDy: 0,
    titleWidth: oneLine(banner.title, banner.titleSize * 0.6),
    subtitleWidth: oneLine(banner.subtitle, banner.subtitleSize * 0.72),
  };
}
