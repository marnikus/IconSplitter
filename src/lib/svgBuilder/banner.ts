// banner.ts — the reference masthead: Solid or Split, on a side (column) or an
// edge (row). Title is never upper-cased; the subtitle always is, letter-spaced.
// Wrapping follows the reference formulas, at most three lines.
import { readableInk } from "./config";
import { attr, round, textEl, textWidth } from "./markup";
import type { Rect, SheetConfig } from "./types";

type Banner = SheetConfig["banner"];
/** Draws the hero icon centred in a square; returns "" when no hero artwork is available. */
export type HeroPainter = (x: number, y: number, size: number, ink: string) => string;

export interface BannerArgs { banner: Banner; box: Rect; artboardWidth: number; title: string; subtitle: string; hero: HeroPainter }

export function wrapLines(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter((w) => w !== "");
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && `${lines[last]} ${word}`.length <= maxChars) lines[last] = `${lines[last]} ${word}`;
    else lines.push(word);
  }
  return lines.slice(0, 3);
}

export function bannerMarkup(a: BannerArgs): string {
  const { box, banner } = a;
  const side = banner.position === "left" || banner.position === "right";
  const body = banner.style === "split" ? (side ? splitSide(a) : splitEdge(a)) : (side ? solidSide(a) : solidEdge(a));
  return `<g data-banner="true"><rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}" fill="${attr(banner.background)}"/>${body}</g>`;
}

function titleLines(a: BannerArgs, side: boolean, size: number): string[] {
  const max = side ? Math.max(7, Math.floor((a.box.width - 56) / Math.max(9, size * 0.64))) : 25;
  return wrapLines(a.title, max);
}

function subtitleLines(a: BannerArgs, side: boolean): string[] {
  const s = a.banner.subtitleSize;
  const max = side ? Math.max(9, Math.floor((a.box.width - 62) / Math.max(7, s * 0.72))) : 28;
  return wrapLines(a.subtitle.toUpperCase(), max);
}

function titleText(a: BannerArgs, lines: string[], at: { x: number; top: number; size: number; ink: string; anchor: "start" | "middle" }): string {
  const serif = a.banner.titleFace === "serif";
  return lines.map((line, i) => textEl({ x: at.x, y: at.top + at.size * 0.83 + i * at.size * 1.03, value: line, size: at.size,
    colour: at.ink, face: a.banner.titleFace, weight: serif ? 500 : 600, anchor: at.anchor, spacing: serif ? "-0.02em" : "-0.045em" })).join("");
}

function subtitleText(a: BannerArgs, lines: string[], at: { x: number; top: number; anchor: "start" | "middle" }): string {
  const s = a.banner.subtitleSize;
  return lines.map((line, i) => textEl({ x: at.x, y: at.top + s * 0.83 + i * s * 1.55, value: line, size: s,
    colour: a.banner.subtitleColor, face: "sans", weight: 500, anchor: at.anchor, spacing: "0.16em" })).join("");
}

/** The hero in a double ring (reference: accent ring at 30 %, inner ring inset 7 px). */
function heroRing(a: BannerArgs, c: { cx: number; cy: number; d: number; glyph: number; ink: string }): string {
  const r = c.d / 2;
  return `<g data-banner-hero="true"><circle cx="${round(c.cx)}" cy="${round(c.cy)}" r="${round(r)}" fill="none" stroke="${attr(a.banner.accent)}" stroke-opacity="0.3"/>`
    + `<circle cx="${round(c.cx)}" cy="${round(c.cy)}" r="${round(Math.max(1, r - 7))}" fill="none" stroke="${attr(a.banner.accent)}" stroke-opacity="0.2"/>`
    + `${a.hero(c.cx - c.glyph / 2, c.cy - c.glyph / 2, c.glyph, c.ink)}</g>`;
}

function solidSide(a: BannerArgs): string {
  const { box, banner } = a;
  const col = { cx: box.x + box.width / 2, top: 0 };
  const glyph = Math.min(80, box.width * 0.35);
  const ring = Math.max(60, glyph + 38);
  const tl = titleLines(a, true, banner.titleSize);
  const sl = subtitleLines(a, true);
  const parts = [banner.hero ? ring + 22 : 0, banner.divider ? 24 : 0, tl.length * banner.titleSize * 1.03, sl.length > 0 ? 14 + sl.length * banner.subtitleSize * 1.55 : 0];
  col.top = box.y + (box.height - parts.reduce((x, y) => x + y, 0)) / 2;
  const hero = banner.hero ? heroRing(a, { cx: col.cx, cy: col.top + ring / 2, d: ring, glyph, ink: banner.accent }) : "";
  const ruleTop = col.top + parts[0];
  const rule = banner.divider ? `<rect x="${round(col.cx - 17)}" y="${round(ruleTop)}" width="34" height="2" fill="${attr(banner.accent)}" data-accent-rule="true"/>` : "";
  const titleTop = ruleTop + parts[1];
  const title = titleText(a, tl, { x: col.cx, top: titleTop, size: banner.titleSize, ink: banner.textColor, anchor: "middle" });
  const sub = subtitleText(a, sl, { x: col.cx, top: titleTop + parts[2] + 14, anchor: "middle" });
  return hero + rule + title + sub;
}

function solidEdge(a: BannerArgs): string {
  const { box, banner } = a;
  const glyph = Math.min(30, box.height * 0.38);
  const tl = titleLines(a, false, banner.titleSize);
  const sl = subtitleLines(a, false);
  const titleW = Math.max(0, ...tl.map((l) => textWidth(l, banner.titleSize)));
  const subW = Math.min(380, Math.max(0, ...sl.map((l) => textWidth(l, banner.subtitleSize, 0.72))));
  const ruleOn = banner.divider && sl.length > 0;
  const widths = [banner.hero ? glyph + 16 : 0, titleW, ruleOn ? 33 : (sl.length > 0 ? 16 : 0), subW];
  let x = box.x + (box.width - widths.reduce((p, q) => p + q, 0)) / 2;
  const cy = box.y + box.height / 2;
  const hero = banner.hero ? `<g data-banner-hero="true">${a.hero(x, cy - glyph / 2, glyph, banner.accent)}</g>` : "";
  x += widths[0];
  const title = titleText(a, tl, { x, top: cy - (tl.length * banner.titleSize * 1.03) / 2, size: banner.titleSize, ink: banner.textColor, anchor: "start" });
  x += widths[1];
  const rule = ruleOn ? `<rect x="${round(x + 16)}" y="${round(cy - 13)}" width="1" height="26" fill="${attr(banner.textColor)}" fill-opacity="0.24" data-accent-rule="true"/>` : "";
  x += widths[2];
  const sub = subtitleText(a, sl, { x, top: cy - (sl.length * banner.subtitleSize * 1.55) / 2, anchor: "start" });
  return hero + title + rule + sub;
}

function splitSide(a: BannerArgs): string {
  const { box, banner } = a;
  const blockH = Math.min(154, box.width * 0.62);
  const ink = readableInk(banner.accent);
  const size = banner.titleSize * 0.8;
  const tl = titleLines(a, true, size);
  const heroH = banner.hero ? 40 + 12 : 0;
  const top = box.y + (blockH - heroH - tl.length * size * 1.03) / 2;
  const cx = box.x + box.width / 2;
  const hero = banner.hero ? heroRing(a, { cx, cy: top + 20, d: 40, glyph: 22, ink }) : "";
  const title = titleText(a, tl, { x: cx, top: top + heroH, size, ink, anchor: "middle" });
  const sl = subtitleLines(a, true);
  const restTop = box.y + blockH + (box.height - blockH - sl.length * banner.subtitleSize * 1.55 - 18) / 2;
  const line = `<rect x="${round(cx - 16)}" y="${round(restTop)}" width="32" height="1" fill="${attr(banner.subtitleColor)}" fill-opacity="0.4"/>`;
  return `<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(blockH)}" fill="${attr(banner.accent)}" data-split-block="true"/>`
    + hero + title + line + subtitleText(a, sl, { x: cx, top: restTop + 18, anchor: "middle" });
}

function splitEdge(a: BannerArgs): string {
  const { box, banner } = a;
  const blockW = Math.min(box.height * 4.45, a.artboardWidth * 0.36);
  const ink = readableInk(banner.accent);
  const tl = titleLines(a, false, banner.titleSize);
  const titleW = Math.max(0, ...tl.map((l) => textWidth(l, banner.titleSize)));
  const heroW = banner.hero ? 36 + 14 : 0;
  const x0 = box.x + Math.max(12, (blockW - heroW - titleW) / 2);
  const cy = box.y + box.height / 2;
  const hero = banner.hero ? heroRing(a, { cx: x0 + 18, cy, d: 36, glyph: 20, ink }) : "";
  const title = titleText(a, tl, { x: x0 + heroW, top: cy - (tl.length * banner.titleSize * 1.03) / 2, size: banner.titleSize, ink, anchor: "start" });
  const sl = subtitleLines(a, false);
  const sub = subtitleText(a, sl, { x: box.x + blockW + 24, top: cy - (sl.length * banner.subtitleSize * 1.55) / 2, anchor: "start" });
  return `<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(blockW)}" height="${round(box.height)}" fill="${attr(banner.accent)}" data-split-block="true"/>`
    + hero + title + sub;
}

