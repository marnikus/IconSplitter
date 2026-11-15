// rebalance.ts — ⇔ Rebalance row (2026-11-15, v3) for a top / bottom banner:
//   1. the title and the subtitle each on ONE line;
//   2. their REAL ink boxes (measure.ts) are what gets spaced: THREE equal gaps,
//      edge → title ink → subtitle ink → edge (solid style);
//   3. the sizes are the OPTIMAL ones for the banner's whole space: the title
//      starts at TITLE_OF_HEIGHT of the banner height, the subtitle at
//      SUB_OF_TITLE of the title, and both shrink by one factor only as far as
//      the gaps need (at least ROW_MIN_GAP of the row; the middle one holds the hero);
//   4. the hero glyph (else the divider) sits exactly in the middle between the texts.
// The split style keeps its block (banner.ts `splitXs`). Pure (the measurer is injected).
import { inkBox, type InkBox, type InkStyle } from "./measure";
import { RANGES, clampTo } from "./ranges";
import { applyCase } from "./textcase";
import type { SheetConfig } from "./types";

type Banner = SheetConfig["banner"];

/** The smallest gap, as a share of the row width. */
export const ROW_MIN_GAP = 0.05;
/** The title's starting size as a share of the banner height; the subtitle's as a share of the title. */
export const TITLE_OF_HEIGHT = 0.55;
export const SUB_OF_TITLE = 0.42;

/** An edge (top / bottom) banner has one row of parts, solid or split. */
export function canRebalance(banner: Pick<Banner, "position" | "style">): boolean {
  return banner.position === "top" || banner.position === "bottom";
}

/** How the banner draws its title and subtitle (banner.ts titleText / subtitleText). */
export function titleStyle(banner: Pick<Banner, "titleFace">): InkStyle {
  const serif = banner.titleFace === "serif";
  return { face: banner.titleFace, weight: serif ? 500 : 600, spacingEm: serif ? -0.02 : -0.045, perChar: 0.56 };
}
export const SUBTITLE_STYLE: InkStyle = { face: "sans", weight: 500, spacingEm: 0.16, perChar: 0.72 };

export interface BannerFit { titleSize: number; subtitleSize: number; gap: number; title: InkBox; sub: InkBox }

const scaled = (b: InkBox, k: number): InkBox => ({ width: b.width * k, left: b.left * k });

/**
 * The optimal title / subtitle sizes and the equal gap for a row `width` wide
 * and `banner.size` tall, from the texts' measured ink (at 100 px, scaled).
 */
export function fitBanner(banner: Banner, width: number, heroWidth = 0): BannerFit {
  const title = applyCase(banner.title.trim(), banner.titleCase);
  const sub = applyCase(banner.subtitle.trim(), banner.subtitleCase);
  const t100 = inkBox(title, 100, titleStyle(banner));
  const s100 = sub === "" ? { width: 0, left: 0 } : inkBox(sub, 100, SUBTITLE_STYLE);
  const titleMax = banner.size * TITLE_OF_HEIGHT, subMax = titleMax * SUB_OF_TITLE;
  const min = Math.max(12, width * ROW_MIN_GAP), gaps = sub === "" ? 2 : 3;
  const needed = heroWidth > 0 && sub !== "" ? heroWidth + min : min;
  const atMax = (t100.width * titleMax + s100.width * subMax) / 100;
  const k = atMax <= 0 ? 1 : Math.min(1, (width - gaps * needed) / atMax);
  // down first, so the gaps never fall below the minimum (clampTo rounds to the slider step)
  const titleSize = clampTo(RANGES.titleSize, Math.floor(titleMax * k));
  const subtitleSize = clampTo(RANGES.subtitleSize, Math.floor(subMax * k));
  const tBox = scaled(t100, titleSize / 100), sBox = scaled(s100, subtitleSize / 100);
  return { titleSize, subtitleSize, gap: (width - tBox.width - sBox.width) / gaps, title: tBox, sub: sBox };
}

/** A box width that keeps `text` on one line (banner.ts wraps at width ÷ charWidth characters). */
function oneLine(text: string, charWidth: number): number {
  return Math.round(clampTo(RANGES.textWidth, Math.ceil(text.trim().length * charWidth) + 2));
}

/** The button's patch: spread on, moves and padding cleared, the optimal sizes, each text one line. */
export function rebalancedBanner(banner: Banner, rowWidth?: number, heroWidth = 0): Partial<Banner> {
  const fit = rowWidth === undefined ? null : fitBanner(banner, rowWidth, heroWidth);
  const titleSize = fit?.titleSize ?? banner.titleSize, subtitleSize = fit?.subtitleSize ?? banner.subtitleSize;
  return {
    edgeSpread: true, textPadding: 0, titleDx: 0, titleDy: 0, subtitleDx: 0, subtitleDy: 0, titleSize, subtitleSize,
    titleWidth: oneLine(banner.title, titleSize * 0.6), subtitleWidth: oneLine(banner.subtitle, subtitleSize * 0.72),
  };
}
