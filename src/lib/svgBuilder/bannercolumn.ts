// bannercolumn.ts — the reference text rule on vertical column banners
// (2026-11-17, split out of banner.ts): the row's principle with the axes
// swapped — gaps measured vertically between the ink blocks, every line centred
// on the column's middle line, the hero or divider in the middle of the double
// gap, a split banner's seam ending there.
import { readableInk } from "./config";
import { attr, round } from "./markup";
import { inkBox } from "./measure";
import { blockInk, fitColumn, subtitleStyle, titleStyle } from "./rebalance";
import { heroRing, heroSize, subtitleLines, subtitleText, titleLines, titleText, type Laid } from "./bannertext";
import type { Rect } from "./types";

const gapBarsV = (cx: number, ys: readonly number[]): Rect[] => ys.slice(0, -1).map((from, i) => ({ x: cx - 1, y: from, width: 2, height: ys[i + 1] - from }));


/**
 * ⇔ The column rule (2026-11-17): the row's principle with the axes swapped. The
 * texts' ink BLOCKS (wrapped lines included) are spaced vertically — edge g ·
 * title · 2g · subtitle · g over the banner's height (rebalance.ts `fitColumn`,
 * the user's sizes, shrunk by one factor only when the gaps need it) — every
 * line's ink centred on the column's middle line, and the hero (else the
 * divider) exactly in the middle of the double gap.
 */
export function columnGeometry(a: Laid) {
  const base = a.banner;
  const sized = heroSize(base, Math.max(60, Math.min(80, a.box.width * 0.35)) + 38, Math.min(80, a.box.width * 0.35));
  const fit = fitColumn(base, a.box.height, a.box.width, base.hero ? sized.d : 0);
  const banner = { ...base, titleSize: fit.titleSize, subtitleSize: fit.subtitleSize };
  const b: Laid = { ...a, banner };
  const tl = titleLines(b, true, banner.titleSize), sl = subtitleLines(b, true);
  const tInk = blockInk(banner, "title", { boxWidth: b.box.width, size: banner.titleSize, step: 1.03 });
  const sInk = blockInk(banner, "subtitle", { boxWidth: b.box.width, size: banner.subtitleSize, step: 1.55 });
  const g = fit.gap, cx = a.box.x + a.box.width / 2;
  const titleInkTop = a.box.y + g, subInkTop = titleInkTop + tInk.height + 2 * g, midY = titleInkTop + tInk.height + g;
  // anchor start at the x that puts each line's ink centre on the column's middle line
  const xsOf = (lines: string[], size: number, style: ReturnType<typeof titleStyle>) => lines.map((line) => {
    const k = inkBox(line, size, style);
    return cx - k.left - k.width / 2;
  });
  const titleXs = xsOf(tl, banner.titleSize, titleStyle(banner));
  const subXs = xsOf(sl, banner.subtitleSize, subtitleStyle(banner));
  const titleTop = titleInkTop + tInk.ascent - banner.titleSize * 0.83;
  const subTop = subInkTop + sInk.ascent - banner.subtitleSize * 0.83;
  return { sized, glyph: sized.glyph, fit, banner, b, tl, sl, tInk, sInk, g, cx, titleInkTop, subInkTop, midY, titleXs, subXs, titleTop, subTop };
}

/** A solid column, spread: the rings (or the divider) between the texts, on the middle line. */
export function spreadSide(a: Laid): string {
  const { sized, glyph, banner, b, tl, sl, cx, midY, titleXs, subXs, titleTop, subTop } = columnGeometry(a);
  const hero = banner.hero ? heroRing(a, { cx, cy: midY, d: sized.d, glyph, ink: banner.accent, bg: banner.background }) : "";
  const rule = !banner.hero && banner.divider && sl.length > 0
    ? `<rect x="${round(cx - 17)}" y="${round(midY - 1)}" width="34" height="2" fill="${attr(banner.accent)}" data-accent-rule="true"/>` : "";
  const title = titleText(b, tl, { x: 0, xs: titleXs, top: titleTop, size: banner.titleSize, ink: banner.textColor, anchor: "start" });
  const sub = subtitleText(b, sl, { x: 0, xs: subXs, top: subTop, anchor: "start" });
  return hero + rule + title + sub;
}

/**
 * A split column, spread (2026-11-17): the accent block ends at the middle of the
 * double gap — the seam takes the divider's place, the hero sits centred on it —
 * the title on the block in its readable ink, the subtitle below, both on the
 * column's middle line, exactly the row's split spread with the axes swapped.
 */
export function splitSpreadSide(a: Laid): string {
  const { sized, glyph, banner, b, tl, sl, cx, midY, titleXs, subXs, titleTop, subTop } = columnGeometry(a);
  const { frame } = a, ink = readableInk(banner.accent);
  const block = `<rect x="${round(frame.x)}" y="${round(frame.y)}" width="${round(frame.width)}" height="${round(Math.max(0, midY - frame.y))}" fill="${attr(banner.accent)}" data-split-block="true"/>`;
  // the column's block is tall enough for the double ring — in the block's readable ink (opaque rule)
  const hero = banner.hero && sl.length > 0 ? heroRing(a, { cx, cy: midY, d: sized.d, glyph, ink, bg: banner.accent }) : "";
  const title = titleText(b, tl, { x: 0, xs: titleXs, top: titleTop, size: banner.titleSize, ink, anchor: "start" });
  return block + hero + title + subtitleText(b, sl, { x: 0, xs: subXs, top: subTop, anchor: "start" });
}


/** The column's ink blocks and vertical gap bars for ▦ Guides (2026-11-17). */
export function columnInkBoxes(laid: Laid): { title: Rect; sub: Rect; gaps: Rect[] } {
  const c = columnGeometry(laid);
  const title = { x: c.cx - c.tInk.width / 2, y: c.titleInkTop, width: c.tInk.width, height: c.tInk.height };
  const sub = { x: c.cx - c.sInk.width / 2, y: c.subInkTop, width: c.sInk.width, height: c.sInk.height };
  const end = laid.box.y + laid.box.height;
  return { title, sub, gaps: c.sl.length > 0
    ? [...gapBarsV(c.cx, [laid.box.y, c.titleInkTop]), ...gapBarsV(c.cx, [c.titleInkTop + c.tInk.height, c.subInkTop]), ...gapBarsV(c.cx, [c.subInkTop + c.sInk.height, end])]
    : gapBarsV(c.cx, [laid.box.y, c.titleInkTop, c.titleInkTop + c.tInk.height, end]).filter((_, i) => i !== 1) };
}
