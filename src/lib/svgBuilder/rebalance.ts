// rebalance.ts — ⇔ Rebalance row (2026-11-15, new rules) for a top / bottom
// banner:
//   1. the title and the subtitle each on ONE line;
//   2. THREE equal gaps: edge → title → subtitle → edge (solid style);
//   3. texts too long → both sizes shrink by the same factor until every gap is
//      at least ROW_MIN_GAP of the row (the middle one also holds the hero);
//   4. the hero glyph (else the divider) sits exactly in the middle of the gap
//      between the texts.
// The split style keeps its block (banner.ts `splitXs`). Pure.
import { textWidth } from "./markup";
import { RANGES, clampTo } from "./ranges";
import { applyCase } from "./textcase";
import type { SheetConfig } from "./types";

type Banner = SheetConfig["banner"];

/** The smallest gap, as a share of the row width. */
export const ROW_MIN_GAP = 0.05;

/** An edge (top / bottom) banner has one row of parts, solid or split. */
export function canRebalance(banner: Pick<Banner, "position" | "style">): boolean {
  return banner.position === "top" || banner.position === "bottom";
}

/**
 * The text scale (≤ 1) and the equal gap for a row of `width`: the title and
 * subtitle widths at scale 1, and the hero glyph that must fit in the middle gap.
 */
export function fitRow(r: { width: number; title: number; sub: number; hero: number }): { scale: number; gap: number } {
  const min = Math.max(12, r.width * ROW_MIN_GAP);
  const gaps = r.sub > 0 ? 3 : 2; // no subtitle: the title centred between two equal gaps
  const gapNeeded = r.hero > 0 && r.sub > 0 ? r.hero + min : min;
  const text = r.title + r.sub;
  const scale = text <= 0 ? 1 : Math.max(0.3, Math.min(1, (r.width - gaps * gapNeeded) / text));
  return { scale, gap: (r.width - text * scale) / gaps };
}

/** The title and subtitle widths at their current sizes, as the banner draws them (one line each). */
export function rowWidths(banner: Banner): { title: number; sub: number } {
  return {
    title: textWidth(applyCase(banner.title.trim(), banner.titleCase), banner.titleSize),
    sub: banner.subtitle.trim() === "" ? 0 : textWidth(applyCase(banner.subtitle.trim(), banner.subtitleCase), banner.subtitleSize, 0.72),
  };
}

/** A box width that keeps `text` on one line (banner.ts wraps at width ÷ charWidth characters). */
function oneLine(text: string, charWidth: number): number {
  return Math.round(clampTo(RANGES.textWidth, Math.ceil(text.trim().length * charWidth) + 2));
}

/**
 * The button's patch: spread on, moves and padding cleared, each text one line,
 * and — given the row width — both sizes shrunk together when they do not fit.
 */
export function rebalancedBanner(banner: Banner, rowWidth?: number, heroWidth = 0): Partial<Banner> {
  const scale = rowWidth === undefined ? 1 : fitRow({ width: rowWidth, ...rowWidths(banner), hero: heroWidth }).scale;
  const fit = (n: number) => (scale < 1 ? Math.floor(n * scale) : n); // down, so the gaps never fall below the minimum
  const titleSize = clampTo(RANGES.titleSize, fit(banner.titleSize));
  const subtitleSize = clampTo(RANGES.subtitleSize, fit(banner.subtitleSize));
  return {
    edgeSpread: true, textPadding: 0, titleDx: 0, titleDy: 0, subtitleDx: 0, subtitleDy: 0, titleSize, subtitleSize,
    titleWidth: oneLine(banner.title, titleSize * 0.6), subtitleWidth: oneLine(banner.subtitle, subtitleSize * 0.72),
  };
}
