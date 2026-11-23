// bannertext.ts — the banner's text and hero painters (2026-11-17, split out of
// banner.ts): wrapping, the title / subtitle <text> blocks with their moves and
// padding, and the hero's double ring. Pure markup from the measured ink styles.
import type { Rect, SheetConfig } from "./types";
import { attr, round, textEl } from "./markup";
import { linesFor, subtitleStyle, titleStyle } from "./rebalance";
import { applyCase } from "./textcase";
import { wrapLines } from "./bannerrow";
import type { BannerArgs } from "./banner";

type Banner = SheetConfig["banner"];

/** Inside the drawing: `box` is where text lays out (inset by Text padding), `frame` the painted banner. */
export interface Laid extends BannerArgs { frame: Rect }

/**
 * An em fraction as the PX one glyph step adds (2026-11-19): `em 0.025` at 32 px
 * is 0.8 px. Writing px keeps the sheet and the shared text outliner agreeing on
 * the same number — an em string was read as 0 there and the exported EPS lost
 * the spacing the artboard showed.
 */
const spacingPx = (em: number, size: number) => Number((em * size).toFixed(4));
/** Characters per line: a width the user set wins (2026-11-14); else the reference limits. */
function perLine(width: number, charWidth: number, auto: number): number {
  return width > 0 ? Math.max(1, Math.floor(width / Math.max(1, charWidth))) : auto;
}


/** Row banners wrap at the reference's fixed limits; columns at the box (rebalance.ts `linesFor`, 2026-11-17). */
export function titleLines(a: BannerArgs, side: boolean, size: number): string[] {
  return side ? linesFor(a.banner, "title", a.box.width, size) : wrapLines(applyCase(a.title, a.banner.titleCase), perLine(a.banner.titleWidth, size * 0.6, 25));
}

export function subtitleLines(a: BannerArgs, side: boolean): string[] {
  const s = a.banner.subtitleSize;
  return side ? linesFor(a.banner, "subtitle", a.box.width, s) : wrapLines(applyCase(a.subtitle, a.banner.subtitleCase), perLine(a.banner.subtitleWidth, s * 0.72, 28));
}

export function titleText(a: BannerArgs, lines: string[], at: { x: number; top: number; size: number; ink: string; anchor: "start" | "middle"; xs?: readonly number[] }): string {
  const serif = a.banner.titleFace === "serif";
  const body = lines.map((line, i) => textEl({ x: at.xs?.[i] ?? at.x, y: at.top + at.size * 0.83 + i * at.size * 1.03, value: line, size: at.size,
    colour: at.ink, face: a.banner.titleFace, weight: serif ? 500 : 600, anchor: at.anchor, spacingPx: spacingPx(titleStyle(a.banner).spacingEm, at.size) })).join("");
  const pad = paddingShift(a.banner);
  return movedText("title", a.banner.titleDx + pad.dx, a.banner.titleDy + pad.dy, body);
}

/**
 * Text padding moves the title AND the subtitle together, the same amount, in
 * from the banner's starting edge (2026-11-14): to the right on a top/bottom
 * banner, down on a left/right one (where it also narrows the wrap width).
 */
export function paddingShift(banner: Banner): { dx: number; dy: number } {
  const side = banner.position === "left" || banner.position === "right";
  return side ? { dx: 0, dy: banner.textPadding } : { dx: banner.textPadding, dy: 0 };
}

/** A text block with its Move X/Y, marked so the artboard can edit it in place (double-click). */
export function movedText(which: "title" | "subtitle", dx: number, dy: number, body: string): string {
  if (body === "") return "";
  const move = dx === 0 && dy === 0 ? "" : ` transform="translate(${round(dx)} ${round(dy)})"`;
  return `<g data-banner-text="${which}"${move}>${body}</g>`;
}

export function subtitleText(a: BannerArgs, lines: string[], at: { x: number; top: number; anchor: "start" | "middle"; xs?: readonly number[] }): string {
  const s = a.banner.subtitleSize;
  const body = lines.map((line, i) => textEl({ x: at.xs?.[i] ?? at.x, y: at.top + s * 0.83 + i * s * 1.55, value: line, size: s,
    colour: a.banner.subtitleColor, face: "sans", weight: 500, anchor: at.anchor, spacingPx: spacingPx(subtitleStyle(a.banner).spacingEm, s) })).join("");
  const pad = paddingShift(a.banner);
  return movedText("subtitle", a.banner.subtitleDx + pad.dx, a.banner.subtitleDy + pad.dy, body);
}

/** The circle and icon sizes after the hero style's Circle size % and Icon size % (2026-11-14). */
export function heroSize(banner: Banner, d: number, glyph: number): { d: number; glyph: number } {
  return { d: d * banner.ringScale / 100, glyph: glyph * banner.heroScale / 100 };
}

/**
 * The hero in a double ring (reference: accent ring at 30 %, inner ring inset 7 px); Circle stroke 0 = no rings.
 * The rings are SOLID, full colour (no transparency or fading in the artwork).
 */
export function heroRing(a: BannerArgs, c: { cx: number; cy: number; d: number; glyph: number; ink: string; bg: string }): string {
  const r = c.d / 2;
  const w = a.banner.ringStroke;
  // Full colour, never faded (2026-11-14): the accent; on the accent-filled split block, the icon's ink.
  const colour = c.bg.toUpperCase() === a.banner.accent.toUpperCase() ? c.ink : a.banner.accent;
  const ring = (radius: number) => `<circle cx="${round(c.cx)}" cy="${round(c.cy)}" r="${round(radius)}" fill="none" stroke="${attr(colour)}" stroke-width="${round(w)}" data-banner-ring="true"/>`;
  const rings = w > 0 ? ring(r) + ring(Math.max(1, r - 7)) : "";
  return `<g data-banner-hero="true">${rings}${a.hero(c.cx - c.glyph / 2, c.cy - c.glyph / 2, c.glyph, c.ink)}</g>`;
}

