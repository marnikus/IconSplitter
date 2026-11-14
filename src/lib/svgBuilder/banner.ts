// banner.ts — the reference masthead: Solid or Split, on a side (column) or an
// edge (row). Title is never upper-cased; the subtitle always is, letter-spaced.
// Wrapping follows the reference formulas, at most three lines.
import { readableInk } from "./config";
import { solidMix } from "./solidcolor";
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
  const laid: Laid = { ...a, frame: box, box: inset(box, banner.textPadding) };
  const body = banner.style === "split" ? (side ? splitSide(laid) : splitEdge(laid)) : (side ? solidSide(laid) : solidEdge(laid));
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
  const body = lines.map((line, i) => textEl({ x: at.x, y: at.top + at.size * 0.83 + i * at.size * 1.03, value: line, size: at.size,
    colour: at.ink, face: a.banner.titleFace, weight: serif ? 500 : 600, anchor: at.anchor, spacing: serif ? "-0.02em" : "-0.045em" })).join("");
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

function subtitleText(a: BannerArgs, lines: string[], at: { x: number; top: number; anchor: "start" | "middle" }): string {
  const s = a.banner.subtitleSize;
  const body = lines.map((line, i) => textEl({ x: at.x, y: at.top + s * 0.83 + i * s * 1.55, value: line, size: s,
    colour: a.banner.subtitleColor, face: "sans", weight: 500, anchor: at.anchor, spacing: "0.16em" })).join("");
  const pad = paddingShift(a.banner);
  return movedText("subtitle", a.banner.subtitleDx + pad.dx, a.banner.subtitleDy + pad.dy, body);
}

/** The circle and icon sizes after the hero style's Circle size % and Icon size % (2026-11-14). */
function heroSize(banner: Banner, d: number, glyph: number): { d: number; glyph: number } {
  return { d: d * banner.ringScale / 100, glyph: glyph * banner.heroScale / 100 };
}

/**
 * The hero in a double ring (reference: accent ring at 30 %, inner ring inset 7 px); Circle stroke 0 = no rings.
 * The rings are SOLID: the accent mixed onto the surface `bg` they sit on (no transparency in the artwork).
 */
function heroRing(a: BannerArgs, c: { cx: number; cy: number; d: number; glyph: number; ink: string; bg: string }): string {
  const r = c.d / 2;
  const w = a.banner.ringStroke;
  const ring = (radius: number, opacity: number) => `<circle cx="${round(c.cx)}" cy="${round(c.cy)}" r="${round(radius)}" fill="none" stroke="${attr(solidMix(a.banner.accent, c.bg, opacity))}" stroke-width="${round(w)}" data-banner-ring="true"/>`;
  const rings = w > 0 ? ring(r, 0.3) + ring(Math.max(1, r - 7), 0.2) : "";
  return `<g data-banner-hero="true">${rings}${a.hero(c.cx - c.glyph / 2, c.cy - c.glyph / 2, c.glyph, c.ink)}</g>`;
}

function solidSide(a: Laid): string {
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

function solidEdge(a: Laid): string {
  const { box, banner } = a;
  const glyph = heroSize(banner, 0, Math.min(30, box.height * 0.38)).glyph;
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
  const rule = ruleOn ? `<rect x="${round(x + 16)}" y="${round(cy - 13)}" width="1" height="26" fill="${attr(solidMix(banner.textColor, banner.background, 0.24))}" data-accent-rule="true"/>` : "";
  x += widths[2];
  const sub = subtitleText(a, sl, { x, top: cy - (sl.length * banner.subtitleSize * 1.55) / 2, anchor: "start" });
  return hero + title + rule + sub;
}

function splitSide(a: Laid): string {
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

function splitEdge(a: Laid): string {
  const { box, banner, frame } = a;
  const blockW = Math.min(frame.height * 4.45, a.artboardWidth * 0.36);
  const ink = readableInk(banner.accent);
  const tl = titleLines(a, false, banner.titleSize);
  const titleW = Math.max(0, ...tl.map((l) => textWidth(l, banner.titleSize)));
  const se = heroSize(banner, 36, 20);
  const heroW = banner.hero ? se.d + 14 : 0;
  const x0 = frame.x + Math.max(12, (blockW - heroW - titleW) / 2);
  const cy = box.y + box.height / 2;
  const hero = banner.hero ? heroRing(a, { cx: x0 + se.d / 2, cy, d: se.d, glyph: se.glyph, ink, bg: banner.accent }) : "";
  const title = titleText(a, tl, { x: x0 + heroW, top: cy - (tl.length * banner.titleSize * 1.03) / 2, size: banner.titleSize, ink, anchor: "start" });
  const sl = subtitleLines(a, false);
  const sub = subtitleText(a, sl, { x: frame.x + blockW + 24, top: cy - (sl.length * banner.subtitleSize * 1.55) / 2, anchor: "start" });
  return `<rect x="${round(frame.x)}" y="${round(frame.y)}" width="${round(blockW)}" height="${round(frame.height)}" fill="${attr(banner.accent)}" data-split-block="true"/>`
    + hero + title + sub;
}

