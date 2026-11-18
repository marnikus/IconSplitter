// banner.ts — the reference masthead: Solid or Split, on a side (column) or an
// edge (row). Title is never upper-cased; the subtitle always is, letter-spaced.
// Wrapping follows the reference formulas, at most three lines.
import { readableInk } from "./config";
import { solidMix } from "./solidcolor";
import { canRebalance, fitBanner, isColumn, rebalancedBanner } from "./rebalance";
import { columnInkBoxes, spreadSide, splitSpreadSide } from "./bannercolumn";
import { heroRing, heroSize, subtitleLines, subtitleText, titleLines, titleText, type Laid } from "./bannertext";

import { applyCase } from "./textcase";
import { edgeXs, wrapLines, type EdgeParts } from "./bannerrow";

export { edgeXs, wrapLines };
import type { InkBox } from "./measure";

export { applyCase };
import { attr, round, textWidth } from "./markup";
import type { Rect, SheetConfig } from "./types";

type Banner = SheetConfig["banner"];
/** Draws the hero icon centred in a square; returns "" when no hero artwork is available. */
export type HeroPainter = (x: number, y: number, size: number, ink: string) => string;

export interface BannerArgs { banner: Banner; box: Rect; artboardWidth: number; title: string; subtitle: string; hero: HeroPainter }

function inset(box: Rect, pad: number): Rect {
  const p = Math.max(0, Math.min(pad, box.width / 2 - 1, box.height / 2 - 1));
  return { x: box.x + p, y: box.y + p, width: box.width - 2 * p, height: box.height - 2 * p };
}


export function bannerMarkup(input: BannerArgs): string {
  // Auto rebalance (2026-11-15): the row is rebalanced for the texts as they are now, on every draw.
  const a = input.banner.autoRebalance && canRebalance(input.banner) ? { ...input, banner: { ...input.banner, ...rebalancedBanner(input.banner) } } : input;
  const { box, banner } = a;
  const side = banner.position === "left" || banner.position === "right";
  const laid: Laid = { ...a, frame: box, box: inset(box, banner.textPadding) };
  const body = banner.style === "split" ? (side ? splitSide(laid) : splitEdge(laid)) : (side ? solidSide(laid) : solidEdge(laid));
  return `<g data-banner="true"><rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}" fill="${attr(banner.background)}"/>${body}</g>`;
}

function solidSide(a: Laid): string {
  if (a.banner.edgeSpread) return spreadSide(a);
  const { box, banner } = a;
  const col = { cx: box.x + box.width / 2, top: 0 };
  const sized = heroSize(banner, Math.max(60, Math.min(80, box.width * 0.35) + 38), Math.min(80, box.width * 0.35));
  const glyph = sized.glyph;
  const ring = sized.d;
  const tl = titleLines(a, true, banner.titleSize);
  const sl = subtitleLines(a, true);
  const parts = [banner.hero ? ring + 22 : 0, banner.divider ? 24 : 0, tl.length * banner.titleSize * 1.03, sl.length > 0 ? 14 + sl.length * banner.subtitleSize * 1.55 : 0];
  col.top = box.y + (box.height - parts.reduce((x, y) => x + y, 0)) / 2;
  const hero = banner.hero ? heroRing(a, { cx: col.cx, cy: col.top + ring / 2, d: ring, glyph, ink: banner.accent, bg: banner.background }) : "";
  const ruleTop = col.top + parts[0];
  const rule = banner.divider ? `<rect x="${round(col.cx - 17)}" y="${round(ruleTop)}" width="34" height="2" fill="${attr(banner.accent)}" data-accent-rule="true"/>` : "";
  const titleTop = ruleTop + parts[1];
  const title = titleText(a, tl, { x: col.cx, top: titleTop, size: banner.titleSize, ink: banner.textColor, anchor: "middle" });
  const sub = subtitleText(a, sl, { x: col.cx, top: titleTop + parts[2] + 14, anchor: "middle" });
  return hero + rule + title + sub;
}


/**
 * ⇔ Rebalance row on a solid edge banner (2026-11-15, v3): the optimal sizes for
 * the banner's space and three equal gaps between the texts' REAL ink edges and
 * the banner edges (rebalance.ts `fitBanner`, measure.ts); one line each; the
 * hero glyph — else the divider — exactly in the middle between the texts' ink.
 */
function spreadGeometry(a: Laid) {
  const base = a.banner;
  const glyph = heroSize(base, 0, Math.min(30, a.box.height * 0.38)).glyph;
  const fit = fitBanner({ ...base, size: a.box.height }, a.box.width, base.hero ? glyph : 0);
  const banner = { ...base, titleSize: fit.titleSize, subtitleSize: fit.subtitleSize, titleWidth: 2000, subtitleWidth: 2000 };
  const b: Laid = { ...a, banner };
  const tl = titleLines(b, false, banner.titleSize), sl = subtitleLines(b, false);
  // the middle gap is twice the edge gap (2026-11-15): the hero / divider / seam sits at its middle
  const inkStart = a.box.x + fit.gap, inkEnd = inkStart + fit.title.width, mid = inkEnd + fit.gap;
  const cy = a.box.y + a.box.height / 2, titleX = inkStart - fit.title.left, subX = inkEnd + 2 * fit.gap - fit.sub.left;
  const titleTop = inkCentredTop(cy, fit.title, banner.titleSize), subTop = inkCentredTop(cy, fit.sub, banner.subtitleSize);
  return { glyph, fit, banner, b, tl, sl, inkStart, inkEnd, mid, cy, titleX, subX, titleTop, subTop };
}

/** The text block's top (titleText / subtitleText draw the baseline at top + 0.83 × size) so its INK box is centred on `cy`. */
function inkCentredTop(cy: number, ink: InkBox, size: number): number {
  return cy + (ink.ascent - ink.descent) / 2 - size * 0.83;
}

const inkRect = (x: number, top: number, size: number, ink: InkBox): Rect => ({ x, y: top + size * 0.83 - ink.ascent, width: ink.width, height: ink.ascent + ink.descent });
const gapBars = (cy: number, xs: readonly number[]): Rect[] => xs.slice(0, -1).map((from, i) => ({ x: from, y: cy - 1, width: xs[i + 1] - from, height: 2 }));
/**
 * A rebalanced SPLIT edge row (2026-11-15) reuses the solid row exactly
 * (`spreadGeometry`: optimal sizes, three equal gaps between the ink edges,
 * every ink box centred in Y); the seam between the two colours takes the
 * divider's place — exactly in the middle of the gap between the texts — and
 * the hero glyph, when on, sits centred on that seam.
 */
function splitSpreadEdge(a: Laid): string {
  const { glyph, banner, b, tl, sl, mid, cy, titleX, subX, titleTop, subTop } = spreadGeometry(a);
  const { frame } = a, ink = readableInk(banner.accent);
  const block = `<rect x="${round(frame.x)}" y="${round(frame.y)}" width="${round(Math.max(0, mid - frame.x))}" height="${round(frame.height)}" fill="${attr(banner.accent)}" data-split-block="true"/>`;
  const hero = banner.hero && sl.length > 0 ? `<g data-banner-hero="true">${b.hero(mid - glyph / 2, cy - glyph / 2, glyph, ink)}</g>` : "";
  const title = titleText(b, tl, { x: titleX, top: titleTop, size: banner.titleSize, ink, anchor: "start" });
  return block + hero + title + subtitleText(b, sl, { x: subX, top: subTop, anchor: "start" });
}

/** Dev mode (2026-11-15): the ink boxes the rebalance used and its three gaps, in artboard px; null when the row is not spread. */
export function spreadInkBoxes(config: SheetConfig, layout: { banner: Rect | null }): { title: Rect; sub: Rect; gaps: Rect[] } | null {
  const raw = config.banner;
  if (layout.banner === null || !canRebalance(raw) || !(raw.edgeSpread || raw.autoRebalance)) return null;
  const banner = raw.autoRebalance ? { ...raw, ...rebalancedBanner(raw) } : raw;
  const laid: Laid = { banner, box: inset(layout.banner, banner.textPadding), frame: layout.banner, artboardWidth: config.artboard.width, title: banner.title, subtitle: banner.subtitle, hero: () => "" };
  if (isColumn(banner)) return columnInkBoxes(laid);
  const g = spreadGeometry(laid);
  const title = inkRect(g.inkStart, g.titleTop, g.banner.titleSize, g.fit.title);
  const sub = inkRect(g.inkEnd + 2 * g.fit.gap, g.subTop, g.banner.subtitleSize, g.fit.sub);
  const end = laid.box.x + laid.box.width;
  return { title, sub, gaps: g.sl.length > 0 ? [...gapBars(g.cy, [laid.box.x, title.x]), ...gapBars(g.cy, [title.x + title.width, sub.x]), ...gapBars(g.cy, [sub.x + sub.width, end])]
    : gapBars(g.cy, [laid.box.x, title.x, title.x + title.width, end]).filter((_, i) => i !== 1) };
}

function spreadEdge(a: Laid): string {
  const { glyph, banner, b, tl, sl, mid, cy, titleX, subX, titleTop, subTop } = spreadGeometry(a);
  const hero = banner.hero && sl.length > 0 ? `<g data-banner-hero="true">${b.hero(mid - glyph / 2, cy - glyph / 2, glyph, banner.accent)}</g>` : "";
  const rule = !banner.hero && banner.divider && sl.length > 0
    ? `<rect x="${round(mid)}" y="${round(cy - 13)}" width="1" height="26" fill="${attr(solidMix(banner.textColor, banner.background, 0.24))}" data-accent-rule="true"/>` : "";
  const title = titleText(b, tl, { x: titleX, top: titleTop, size: banner.titleSize, ink: banner.textColor, anchor: "start" });
  const sub = subtitleText(b, sl, { x: subX, top: subTop, anchor: "start" });
  return hero + title + rule + sub;
}

function solidEdge(a: Laid): string {
  if (a.banner.edgeSpread) return spreadEdge(a);
  const { box, banner } = a;
  const glyph = heroSize(banner, 0, Math.min(30, box.height * 0.38)).glyph;
  const tl = titleLines(a, false, banner.titleSize);
  const sl = subtitleLines(a, false);
  const subMax = banner.edgeSpread ? Infinity : 380;
  const parts: EdgeParts = { hero: banner.hero ? glyph : 0, title: Math.max(0, ...tl.map((l) => textWidth(l, banner.titleSize))), rule: banner.divider && sl.length > 0,
    sub: Math.min(subMax, Math.max(0, ...sl.map((l) => textWidth(l, banner.subtitleSize, 0.72)))) };
  const x = edgeXs(box, parts, banner.edgeSpread);
  const cy = box.y + box.height / 2;
  const hero = banner.hero ? `<g data-banner-hero="true">${a.hero(x.hero, cy - glyph / 2, glyph, banner.accent)}</g>` : "";
  const title = titleText(a, tl, { x: x.title, top: cy - (tl.length * banner.titleSize * 1.03) / 2, size: banner.titleSize, ink: banner.textColor, anchor: "start" });
  const rule = parts.rule ? `<rect x="${round(x.rule)}" y="${round(cy - 13)}" width="1" height="26" fill="${attr(solidMix(banner.textColor, banner.background, 0.24))}" data-accent-rule="true"/>` : "";
  const sub = subtitleText(a, sl, { x: x.sub, top: cy - (sl.length * banner.subtitleSize * 1.55) / 2, anchor: "start" });
  return hero + title + rule + sub;
}

function splitSide(a: Laid): string {
  if (a.banner.edgeSpread) return splitSpreadSide(a);
  const { box, banner, frame } = a;
  const blockH = Math.min(154, frame.width * 0.62);
  const ink = readableInk(banner.accent);
  const size = banner.titleSize * 0.8;
  const tl = titleLines(a, true, size);
  const sh = heroSize(banner, 40, 22);
  const heroH = banner.hero ? sh.d + 12 : 0;
  const top = frame.y + (blockH - heroH - tl.length * size * 1.03) / 2;
  const cx = box.x + box.width / 2;
  const hero = banner.hero ? heroRing(a, { cx, cy: top + sh.d / 2, d: sh.d, glyph: sh.glyph, ink, bg: banner.accent }) : "";
  const title = titleText(a, tl, { x: cx, top: top + heroH, size, ink, anchor: "middle" });
  const sl = subtitleLines(a, true);
  const restH = frame.height - blockH;
  const restTop = frame.y + blockH + (restH - sl.length * banner.subtitleSize * 1.55 - 18) / 2;
  const line = `<rect x="${round(cx - 16)}" y="${round(restTop)}" width="32" height="1" fill="${attr(solidMix(banner.subtitleColor, banner.background, 0.4))}"/>`;
  return `<rect x="${round(frame.x)}" y="${round(frame.y)}" width="${round(frame.width)}" height="${round(blockH)}" fill="${attr(banner.accent)}" data-split-block="true"/>`
    + hero + title + line + subtitleText(a, sl, { x: cx, top: restTop + 18, anchor: "middle" });
}

/**
 * A split edge row: the reference (hero + title centred in the block, the
 * subtitle 24 px after it), or spread (⇔ Rebalance row): hero + title with
 * equal gaps inside the block, the subtitle centred in the rest of the banner.
 */
function splitXs(a: Laid, p: { blockW: number; heroD: number; titleW: number; subW: number }): { hero: number; title: number; sub: number } {
  const { frame } = a;
  if (!a.banner.edgeSpread) {
    const heroW = p.heroD > 0 ? p.heroD + 14 : 0;
    const x0 = frame.x + Math.max(12, (p.blockW - heroW - p.titleW) / 2);
    return { hero: x0, title: x0 + heroW, sub: frame.x + p.blockW + 24 };
  }
  const inBlock = edgeXs({ ...frame, width: p.blockW }, { hero: p.heroD, title: p.titleW, rule: false, sub: 0 }, true);
  const rest = frame.width - p.blockW;
  return { hero: inBlock.hero, title: inBlock.title, sub: frame.x + p.blockW + Math.max(0, (rest - p.subW) / 2) };
}

function splitEdge(a: Laid): string {
  if (a.banner.edgeSpread) return splitSpreadEdge(a);
  const { box, banner, frame } = a;
  const blockW = Math.min(frame.height * 4.45, a.artboardWidth * 0.36);
  const ink = readableInk(banner.accent);
  const tl = titleLines(a, false, banner.titleSize);
  const titleW = Math.max(0, ...tl.map((l) => textWidth(l, banner.titleSize)));
  const se = heroSize(banner, 36, 20);
  const cy = box.y + box.height / 2;
  const sl = subtitleLines(a, false);
  const subW = Math.max(0, ...sl.map((l) => textWidth(l, banner.subtitleSize, 0.72)));
  const at = splitXs(a, { blockW, heroD: banner.hero ? se.d : 0, titleW, subW });
  const hero = banner.hero ? heroRing(a, { cx: at.hero + se.d / 2, cy, d: se.d, glyph: se.glyph, ink, bg: banner.accent }) : "";
  const title = titleText(a, tl, { x: at.title, top: cy - (tl.length * banner.titleSize * 1.03) / 2, size: banner.titleSize, ink, anchor: "start" });
  const sub = subtitleText(a, sl, { x: at.sub, top: cy - (sl.length * banner.subtitleSize * 1.55) / 2, anchor: "start" });
  return `<rect x="${round(frame.x)}" y="${round(frame.y)}" width="${round(blockW)}" height="${round(frame.height)}" fill="${attr(banner.accent)}" data-split-block="true"/>`
    + hero + title + sub;
}

