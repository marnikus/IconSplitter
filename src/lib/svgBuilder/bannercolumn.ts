// bannercolumn.ts — the reference rule on vertical column banners (2026-11-17,
// redefined 2026-11-18 against the reference frame): the column is a STACK —
// hero glyph, accent rule, title, subtitle — spaced vertically with x on the
// top and bottom edges and 1/3 · x between every two neighbouring objects that
// are present (rebalance.ts `fitColumn`), so turning the hero or the rule off
// keeps 1/3 · x between the rest and x on the edges. Every line's ink is
// centred on the column's middle line; a split banner's colour seam sits in
// the middle of the gap between the texts.
import { readableInk } from "./config";
import { attr, round } from "./markup";
import { inkBox } from "./measure";
import { blockInk, fitColumn, subtitleStyle, titleStyle } from "./rebalance";
import { heroRing, heroSize, subtitleLines, subtitleText, titleLines, titleText, type Laid } from "./bannertext";
import type { Rect } from "./types";

/**
 * The column stack's geometry: walk the present objects top to bottom, x on the
 * edges and 1/3 · x between neighbours; `bounds` holds every object's top and
 * bottom (plus both edges) so ▦ Guides draws one bar per gap.
 */
export function columnGeometry(a: Laid) {
  const base = a.banner;
  const sized = heroSize(base, Math.max(60, Math.min(80, a.box.width * 0.35)) + 38, Math.min(80, a.box.width * 0.35));
  const fit = fitColumn(base, a.box.height, a.box.width, { hero: base.hero ? sized.d : 0, rule: base.divider ? 2 : 0 });
  const banner = { ...base, titleSize: fit.titleSize, subtitleSize: fit.subtitleSize };
  const b: Laid = { ...a, banner };
  const tl = titleLines(b, true, banner.titleSize), sl = subtitleLines(b, true);
  const tInk = blockInk(banner, "title", { boxWidth: b.box.width, size: banner.titleSize, step: 1.03 });
  const sInk = blockInk(banner, "subtitle", { boxWidth: b.box.width, size: banner.subtitleSize, step: 1.55 });
  const x = fit.gap, unit = x / 3, cx = a.box.x + a.box.width / 2;
  const bounds: number[] = [a.box.y];
  let cur = a.box.y + x;
  const place = (h: number): number => { const top = cur; bounds.push(top, top + h); cur = top + h + unit; return top; };
  const heroTop = base.hero ? place(sized.d) : null;
  const ruleY = base.divider ? place(2) : null;
  const titleInkTop = tl.length > 0 ? place(tInk.height) : null;
  const subInkTop = sl.length > 0 ? place(sInk.height) : null;
  bounds.push(a.box.y + a.box.height);
  const seamY = subInkTop === null ? a.box.y + a.box.height - x : subInkTop - unit / 2; // the middle of the gap between the texts
  // anchor start at the x that puts each line's ink centre on the column's middle line
  const xsOf = (lines: string[], size: number, style: ReturnType<typeof titleStyle>) => lines.map((line) => {
    const k = inkBox(line, size, style);
    return cx - k.left - k.width / 2;
  });
  const titleXs = xsOf(tl, banner.titleSize, titleStyle(banner));
  const subXs = xsOf(sl, banner.subtitleSize, subtitleStyle(banner));
  const titleTop = titleInkTop === null ? 0 : titleInkTop + tInk.ascent - banner.titleSize * 0.83;
  const subTop = subInkTop === null ? 0 : subInkTop + sInk.ascent - banner.subtitleSize * 0.83;
  return { sized, glyph: sized.glyph, fit, banner, b, tl, sl, tInk, sInk, x, unit, cx, heroTop, ruleY, titleInkTop, subInkTop, seamY, titleXs, subXs, titleTop, subTop, bounds };
}

/** A solid column, spread: the stack on the middle line, in the banner's own inks. */
export function spreadSide(a: Laid): string {
  const g = columnGeometry(a);
  const { banner, b, cx } = g;
  const hero = g.heroTop === null ? "" : heroRing(a, { cx, cy: g.heroTop + g.sized.d / 2, d: g.sized.d, glyph: g.glyph, ink: banner.accent, bg: banner.background });
  const rule = g.ruleY === null ? "" : `<rect x="${round(cx - 17)}" y="${round(g.ruleY)}" width="34" height="2" fill="${attr(banner.accent)}" data-accent-rule="true"/>`;
  const title = titleText(b, g.tl, { x: 0, xs: g.titleXs, top: g.titleTop, size: banner.titleSize, ink: banner.textColor, anchor: "start" });
  const sub = subtitleText(b, g.sl, { x: 0, xs: g.subXs, top: g.subTop, anchor: "start" });
  return hero + rule + title + sub;
}

/**
 * A split column, spread (2026-11-18): the accent block ends at the middle of
 * the gap between the texts; the stack above it — hero ring and accent rule
 * included — draws in the block's readable ink (opaque rule), the subtitle
 * below in its own colour, everything on the column's middle line.
 */
export function splitSpreadSide(a: Laid): string {
  const g = columnGeometry(a);
  const { banner, b, cx } = g;
  const frame = a.frame;
  const ink = readableInk(banner.accent);
  const block = `<rect x="${round(frame.x)}" y="${round(frame.y)}" width="${round(frame.width)}" height="${round(Math.max(0, g.seamY - frame.y))}" fill="${attr(banner.accent)}" data-split-block="true"/>`;
  const hero = g.heroTop === null ? "" : heroRing(a, { cx, cy: g.heroTop + g.sized.d / 2, d: g.sized.d, glyph: g.glyph, ink, bg: banner.accent });
  const rule = g.ruleY === null ? "" : `<rect x="${round(cx - 17)}" y="${round(g.ruleY)}" width="34" height="2" fill="${attr(ink)}" data-accent-rule="true"/>`;
  const title = titleText(b, g.tl, { x: 0, xs: g.titleXs, top: g.titleTop, size: banner.titleSize, ink, anchor: "start" });
  return block + hero + rule + title + subtitleText(b, g.sl, { x: 0, xs: g.subXs, top: g.subTop, anchor: "start" });
}

/** The column's ink blocks and one vertical gap bar per gap for ▦ Guides (2026-11-17). */
export function columnInkBoxes(laid: Laid): { title: Rect; sub: Rect; gaps: Rect[] } {
  const c = columnGeometry(laid);
  const zero: Rect = { x: c.cx, y: laid.box.y, width: 0, height: 0 };
  const title = c.titleInkTop === null ? zero : { x: c.cx - c.tInk.width / 2, y: c.titleInkTop, width: c.tInk.width, height: c.tInk.height };
  const sub = c.subInkTop === null ? zero : { x: c.cx - c.sInk.width / 2, y: c.subInkTop, width: c.sInk.width, height: c.sInk.height };
  // bounds alternate gap-start / gap-end around every object: pair them, never chain them
  const gaps: Rect[] = [];
  for (let i = 0; i + 1 < c.bounds.length; i += 2) gaps.push({ x: c.cx - 1, y: c.bounds[i], width: 2, height: c.bounds[i + 1] - c.bounds[i] });
  return { title, sub, gaps };
}
