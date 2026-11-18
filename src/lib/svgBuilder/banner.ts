// banner.ts — the reference masthead: Solid or Split, on a side (column) or an
// edge (row). Title is never upper-cased; the subtitle always is, letter-spaced.
// Wrapping follows the reference formulas, at most three lines.
import { readableInk } from "./config";
import { solidMix } from "./solidcolor";
import { blockInk, canRebalance, fitBanner, fitColumn, isColumn, linesFor, rebalancedBanner, subtitleStyle, titleStyle } from "./rebalance";

/** An em length for letter-spacing, without float noise: 0.055em. */
const em = (n: number) => `${Number(n.toFixed(4))}em`;
import { applyCase } from "./textcase";
import { edgeXs, wrapLines, type EdgeParts } from "./bannerrow";

export { edgeXs, wrapLines };
import { inkBox, type InkBox } from "./measure";

export { applyCase };
import { attr, round, textEl, textWidth } from "./markup";
import type { Rect, SheetConfig } from "./types";

type Banner = SheetConfig["banner"];
/** Draws the hero icon centred in a square; returns "" when no hero artwork is available. */
export type HeroPainter = (x: number, y: number, size: number, ink: string) => string;

export interface BannerArgs { banner: Banner; box: Rect; artboardWidth: number; title: string; subtitle: string; hero: HeroPainter }

/** Inside the drawing: `box` is where text lays out (inset by Text padding), `frame` the painted banner. */
interface Laid extends BannerArgs { frame: Rect }

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

/** Characters per line: a width the user set wins (2026-11-14); else the reference limits. */
function perLine(width: number, charWidth: number, auto: number): number {
  return width > 0 ? Math.max(1, Math.floor(width / Math.max(1, charWidth))) : auto;
}


/** Row banners wrap at the reference's fixed limits; columns at the box (rebalance.ts `linesFor`, 2026-11-17). */
function titleLines(a: BannerArgs, side: boolean, size: number): string[] {
  return side ? linesFor(a.banner, "title", a.box.width, size) : wrapLines(applyCase(a.title, a.banner.titleCase), perLine(a.banner.titleWidth, size * 0.6, 25));
}

function subtitleLines(a: BannerArgs, side: boolean): string[] {
  const s = a.banner.subtitleSize;
  return side ? linesFor(a.banner, "subtitle", a.box.width, s) : wrapLines(applyCase(a.subtitle, a.banner.subtitleCase), perLine(a.banner.subtitleWidth, s * 0.72, 28));
}

function titleText(a: BannerArgs, lines: string[], at: { x: number; top: number; size: number; ink: string; anchor: "start" | "middle"; xs?: readonly number[] }): string {
  const serif = a.banner.titleFace === "serif";
  const body = lines.map((line, i) => textEl({ x: at.xs?.[i] ?? at.x, y: at.top + at.size * 0.83 + i * at.size * 1.03, value: line, size: at.size,
    colour: at.ink, face: a.banner.titleFace, weight: serif ? 500 : 600, anchor: at.anchor, spacing: em(titleStyle(a.banner).spacingEm) })).join("");
  const pad = paddingShift(a.banner);
  return movedText("title", a.banner.titleDx + pad.dx, a.banner.titleDy + pad.dy, body);
}

/**
 * Text padding moves the title AND the subtitle together, the same amount, in
 * from the banner's starting edge (2026-11-14): to the right on a top/bottom
 * banner, down on a left/right one (where it also narrows the wrap width).
 */
function paddingShift(banner: Banner): { dx: number; dy: number } {
  const side = banner.position === "left" || banner.position === "right";
  return side ? { dx: 0, dy: banner.textPadding } : { dx: banner.textPadding, dy: 0 };
}

/** A text block with its Move X/Y, marked so the artboard can edit it in place (double-click). */
function movedText(which: "title" | "subtitle", dx: number, dy: number, body: string): string {
  if (body === "") return "";
  const move = dx === 0 && dy === 0 ? "" : ` transform="translate(${round(dx)} ${round(dy)})"`;
  return `<g data-banner-text="${which}"${move}>${body}</g>`;
}

function subtitleText(a: BannerArgs, lines: string[], at: { x: number; top: number; anchor: "start" | "middle"; xs?: readonly number[] }): string {
  const s = a.banner.subtitleSize;
  const body = lines.map((line, i) => textEl({ x: at.xs?.[i] ?? at.x, y: at.top + s * 0.83 + i * s * 1.55, value: line, size: s,
    colour: a.banner.subtitleColor, face: "sans", weight: 500, anchor: at.anchor, spacing: em(subtitleStyle(a.banner).spacingEm) })).join("");
  const pad = paddingShift(a.banner);
  return movedText("subtitle", a.banner.subtitleDx + pad.dx, a.banner.subtitleDy + pad.dy, body);
}

/** The circle and icon sizes after the hero style's Circle size % and Icon size % (2026-11-14). */
function heroSize(banner: Banner, d: number, glyph: number): { d: number; glyph: number } {
  return { d: d * banner.ringScale / 100, glyph: glyph * banner.heroScale / 100 };
}

/**
 * The hero in a double ring (reference: accent ring at 30 %, inner ring inset 7 px); Circle stroke 0 = no rings.
 * The rings are SOLID, full colour (no transparency or fading in the artwork).
 */
function heroRing(a: BannerArgs, c: { cx: number; cy: number; d: number; glyph: number; ink: string; bg: string }): string {
  const r = c.d / 2;
  const w = a.banner.ringStroke;
  // Full colour, never faded (2026-11-14): the accent; on the accent-filled split block, the icon's ink.
  const colour = c.bg.toUpperCase() === a.banner.accent.toUpperCase() ? c.ink : a.banner.accent;
  const ring = (radius: number) => `<circle cx="${round(c.cx)}" cy="${round(c.cy)}" r="${round(radius)}" fill="none" stroke="${attr(colour)}" stroke-width="${round(w)}" data-banner-ring="true"/>`;
  const rings = w > 0 ? ring(r) + ring(Math.max(1, r - 7)) : "";
  return `<g data-banner-hero="true">${rings}${a.hero(c.cx - c.glyph / 2, c.cy - c.glyph / 2, c.glyph, c.ink)}</g>`;
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
const gapBarsV = (cx: number, ys: readonly number[]): Rect[] => ys.slice(0, -1).map((from, i) => ({ x: cx - 1, y: from, width: 2, height: ys[i + 1] - from }));

/**
 * ⇔ The column rule (2026-11-17): the row's principle with the axes swapped. The
 * texts' ink BLOCKS (wrapped lines included) are spaced vertically — edge g ·
 * title · 2g · subtitle · g over the banner's height (rebalance.ts `fitColumn`,
 * the user's sizes, shrunk by one factor only when the gaps need it) — every
 * line's ink centred on the column's middle line, and the hero (else the
 * divider) exactly in the middle of the double gap.
 */
function columnGeometry(a: Laid) {
  const base = a.banner;
  const sized = heroSize(base, Math.max(60, Math.min(80, a.box.width * 0.35)) + 38, Math.min(80, a.box.width * 0.35));
  const fit = fitColumn(base, a.box.height, a.box.width, base.hero ? sized.d : 0);
  const banner = { ...base, titleSize: fit.titleSize, subtitleSize: fit.subtitleSize };
  const b: Laid = { ...a, banner };
  const tl = titleLines(b, true, banner.titleSize), sl = subtitleLines(b, true);
  const tInk = blockInk(banner, "title", b.box.width, banner.titleSize, 1.03);
  const sInk = blockInk(banner, "subtitle", b.box.width, banner.subtitleSize, 1.55);
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
function spreadSide(a: Laid): string {
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
function splitSpreadSide(a: Laid): string {
  const { sized, glyph, banner, b, tl, sl, cx, midY, titleXs, subXs, titleTop, subTop } = columnGeometry(a);
  const { frame } = a, ink = readableInk(banner.accent);
  const block = `<rect x="${round(frame.x)}" y="${round(frame.y)}" width="${round(frame.width)}" height="${round(Math.max(0, midY - frame.y))}" fill="${attr(banner.accent)}" data-split-block="true"/>`;
  // the column's block is tall enough for the double ring — in the block's readable ink (opaque rule)
  const hero = banner.hero && sl.length > 0 ? heroRing(a, { cx, cy: midY, d: sized.d, glyph, ink, bg: banner.accent }) : "";
  const title = titleText(b, tl, { x: 0, xs: titleXs, top: titleTop, size: banner.titleSize, ink, anchor: "start" });
  return block + hero + title + subtitleText(b, sl, { x: 0, xs: subXs, top: subTop, anchor: "start" });
}

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
  if (isColumn(banner)) {
    const c = columnGeometry(laid);
    const title = { x: c.cx - c.tInk.width / 2, y: c.titleInkTop, width: c.tInk.width, height: c.tInk.height };
    const sub = { x: c.cx - c.sInk.width / 2, y: c.subInkTop, width: c.sInk.width, height: c.sInk.height };
    const end = laid.box.y + laid.box.height;
    return { title, sub, gaps: c.sl.length > 0
      ? [...gapBarsV(c.cx, [laid.box.y, c.titleInkTop]), ...gapBarsV(c.cx, [c.titleInkTop + c.tInk.height, c.subInkTop]), ...gapBarsV(c.cx, [c.subInkTop + c.sInk.height, end])]
      : gapBarsV(c.cx, [laid.box.y, c.titleInkTop, c.titleInkTop + c.tInk.height, end]).filter((_, i) => i !== 1) };
  }
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

