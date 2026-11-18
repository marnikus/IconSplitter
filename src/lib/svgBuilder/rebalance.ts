// rebalance.ts — ⇔ Rebalance (2026-11-15, v3; columns 2026-11-17) for every banner
// with texts: a ROW on a top / bottom banner, a COLUMN on a left / right one:
//   1. row: the title and the subtitle each on ONE line;
//   2. their REAL ink boxes (measure.ts) are what gets spaced, along the banner's
//      long axis: edge → title ink → subtitle ink → edge with the middle gap TWICE
//      the edge gaps, so each text is centred in its half (solid and split);
//   3. row: the sizes are the OPTIMAL ones for the banner's whole space: the title
//      starts at TITLE_OF_HEIGHT of the banner height, the subtitle at
//      SUB_OF_TITLE of the title, and both shrink by one factor only as far as
//      the gaps need (at least ROW_MIN_GAP of the span; the middle one holds the hero);
//      column: the user's sizes stay, shrunk by one factor only when the gaps need it;
//   4. the hero glyph (else the divider) sits exactly in the middle between the texts;
//   5. the ink is centred on the banner's middle line of the OTHER axis (row: Y,
//      column: X, every wrapped line centred on it).
// The split style keeps its block (banner.ts `splitXs`). Pure (the measurer is injected).
import { wrapLines } from "./bannerrow";
import { inkBox, type InkBox, type InkStyle } from "./measure";
import { RANGES, clampTo } from "./ranges";
import { applyCase } from "./textcase";
import type { SheetConfig } from "./types";

type Banner = SheetConfig["banner"];

/** The defaults of the user's proportions (banner.rowGapPct / titleFillPct / subRatioPct, 2026-11-15). */
export const ROW_MIN_GAP = 0.05;
export const TITLE_OF_HEIGHT = 0.55;
export const SUB_OF_TITLE = 0.42;

/** An edge (top / bottom) banner has one row of parts, solid or split. */
export function canRebalance(banner: Pick<Banner, "position" | "style">): boolean {
  return banner.position !== "none";
}

/** A left / right banner stacks its parts in a column: the rule runs vertically (2026-11-17). */
export function isColumn(banner: Pick<Banner, "position" | "style">): boolean {
  return banner.position === "left" || banner.position === "right";
}

/** The span the rule measures its gaps along: the row's width, the column's height. */
export function rebalanceSpan(banner: Pick<Banner, "position" | "style">, bannerBox: { height: number; width: number } | null, artboard: { width: number; height: number }): number {
  return isColumn(banner) ? (bannerBox?.height ?? artboard.height) : artboard.width;
}

/** Characters per line, exactly as banner.ts wraps (titleLines / subtitleLines). */
export function linesFor(banner: Banner, which: "title" | "subtitle", boxWidth: number, size: number): string[] {
  const text = applyCase(which === "title" ? banner.title : banner.subtitle, which === "title" ? banner.titleCase : banner.subtitleCase);
  const width = which === "title" ? banner.titleWidth : banner.subtitleWidth;
  const auto = which === "title" ? Math.max(7, Math.floor((boxWidth - 56) / Math.max(9, size * 0.64)))
    : Math.max(9, Math.floor((boxWidth - 62) / Math.max(7, size * 0.72)));
  const perLine = width > 0 ? Math.max(1, Math.floor(width / Math.max(1, size * (which === "title" ? 0.6 : 0.72)))) : auto;
  return wrapLines(text, perLine);
}

/** A text block's ink height and widest line ink at `size`: `step` per extra line (title 1.03, subtitle 1.55). */
export function blockInk(banner: Banner, which: "title" | "subtitle", boxWidth: number, size: number, step: number): { height: number; width: number; ascent: number; descent: number; lines: string[] } {
  const lines = linesFor(banner, which, boxWidth, size);
  if (lines.length === 0) return { height: 0, width: 0, ascent: 0, descent: 0, lines };
  const style = which === "title" ? titleStyle(banner) : subtitleStyle(banner);
  let width = 0, ascent = 0, descent = 0;
  for (const line of lines) {
    const b = inkBox(line, size, style);
    width = Math.max(width, b.width);
    ascent = Math.max(ascent, b.ascent);
    descent = Math.max(descent, b.descent);
  }
  return { height: (lines.length - 1) * size * step + ascent + descent, width, ascent, descent, lines };
}

/** The smallest edge gap the column allows: the row's minimum, on the height (2026-11-17). */
function columnNeeded(banner: Banner, span: number, heroSpan: number, hasSub: boolean): number {
  const min = Math.max(12, span * (banner.rowGapPct ?? ROW_MIN_GAP * 100) / 100);
  return heroSpan > 0 && hasSub ? Math.max(min, heroSpan / 2 + min) : min;
}

export interface ColumnFit { titleSize: number; subtitleSize: number; gap: number }

/**
 * The column's sizes and edge gap (2026-11-17): the user's sizes, shrunk by ONE
 * factor (whole pixels, down) only as far as the vertical gaps need — edge g,
 * title block, 2g (holding the hero), subtitle block, g over the banner height.
 */
export function fitColumn(banner: Banner, height: number, boxWidth: number, heroHeight = 0): ColumnFit {
  const hasSub = applyCase(banner.subtitle.trim(), banner.subtitleCase) !== "";
  const needed = columnNeeded(banner, height, heroHeight, hasSub);
  const blocks = (t: number, s: number) => blockInk(banner, "title", boxWidth, t, 1.03).height
    + (hasSub ? blockInk(banner, "subtitle", boxWidth, s, 1.55).height : 0);
  const gapOf = (t: number, s: number) => (height - blocks(t, s)) / 4;
  let titleSize = clampTo(RANGES.titleSize, banner.titleSize);
  let subtitleSize = clampTo(RANGES.subtitleSize, banner.subtitleSize);
  let lo = 0.02, hi = 1;
  if (gapOf(titleSize, subtitleSize) < needed) {
    for (let i = 0; i < 34; i += 1) {
      const mid = (lo + hi) / 2;
      const t = Math.max(1, Math.floor(titleSize * mid)), s = Math.max(1, Math.floor(subtitleSize * mid));
      if (gapOf(t, s) >= needed) lo = mid; else hi = mid;
    }
    titleSize = Math.max(1, Math.floor(titleSize * lo));
    subtitleSize = Math.max(1, Math.floor(subtitleSize * lo));
    while (gapOf(titleSize, subtitleSize) < needed && (titleSize > 1 || subtitleSize > 1)) {
      titleSize = Math.max(1, titleSize - 1);
      subtitleSize = Math.max(1, subtitleSize - 1);
    }
  }
  return { titleSize, subtitleSize, gap: gapOf(titleSize, subtitleSize) };
}

/** How the banner draws its title and subtitle (banner.ts titleText / subtitleText). */
export function titleStyle(banner: Pick<Banner, "titleFace" | "titleTracking">): InkStyle {
  const serif = banner.titleFace === "serif";
  return { face: banner.titleFace, weight: serif ? 500 : 600, spacingEm: (serif ? -0.02 : -0.045) + (banner.titleTracking ?? 0) / 100, perChar: 0.56 };
}
export function subtitleStyle(banner: Pick<Banner, "subtitleTracking">): InkStyle {
  return { face: "sans", weight: 500, spacingEm: 0.16 + (banner.subtitleTracking ?? 0) / 100, perChar: 0.72 };
}

export interface BannerFit { titleSize: number; subtitleSize: number; gap: number; title: InkBox; sub: InkBox }

const scaled = (b: InkBox, k: number): InkBox => ({ width: b.width * k, left: b.left * k, ascent: b.ascent * k, descent: b.descent * k });

/**
 * The optimal title / subtitle sizes and the equal gap for a row `width` wide
 * and `banner.size` tall, from the texts' measured ink (at 100 px, scaled).
 */
export function fitBanner(banner: Banner, width: number, heroWidth = 0): BannerFit {
  const title = applyCase(banner.title.trim(), banner.titleCase);
  const sub = applyCase(banner.subtitle.trim(), banner.subtitleCase);
  const t100 = inkBox(title, 100, titleStyle(banner));
  const s100 = sub === "" ? { width: 0, left: 0, ascent: 0, descent: 0 } : inkBox(sub, 100, subtitleStyle(banner));
  const titleMax = banner.size * (banner.titleFillPct ?? TITLE_OF_HEIGHT * 100) / 100;
  const subMax = titleMax * (banner.subRatioPct ?? SUB_OF_TITLE * 100) / 100;
  // The gap between the texts is TWICE the edge gaps (2026-11-15), so each text is centred in its half:
  // edge g · title · 2g · subtitle · g → 4 units; without a subtitle the title is centred (2 units).
  const min = Math.max(12, width * (banner.rowGapPct ?? ROW_MIN_GAP * 100) / 100), gaps = sub === "" ? 2 : 4;
  const needed = heroWidth > 0 && sub !== "" ? Math.max(min, heroWidth / 2 + min) : min;
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

/**
 * The button's patch: spread on, moves and padding cleared. A ROW also gets the
 * optimal sizes and each text on one line; a COLUMN keeps the user's sizes and
 * wrapping (the draw fits them, shrinking only when the gaps need it, 2026-11-17).
 */
export function rebalancedBanner(banner: Banner, span?: number, heroWidth = 0): Partial<Banner> {
  if (isColumn(banner)) {
    return { edgeSpread: true, textPadding: 0, titleDx: 0, titleDy: 0, subtitleDx: 0, subtitleDy: 0 };
  }
  const fit = span === undefined ? null : fitBanner(banner, span, heroWidth);
  const titleSize = fit?.titleSize ?? banner.titleSize, subtitleSize = fit?.subtitleSize ?? banner.subtitleSize;
  return {
    edgeSpread: true, textPadding: 0, titleDx: 0, titleDy: 0, subtitleDx: 0, subtitleDy: 0, titleSize, subtitleSize,
    titleWidth: oneLine(banner.title, titleSize * 0.6), subtitleWidth: oneLine(banner.subtitle, subtitleSize * 0.72),
  };
}
