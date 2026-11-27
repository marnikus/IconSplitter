// palette.ts — the edit mode's colours (2026-11-27): the current colour and a
// second one that trade places (X, as in Illustrator), and the swatches the
// user saved. Colours are `#RRGGBB`; anything else read from storage or the
// page is dropped (RULE 13). Pure.

import { cleanHex } from "../svgBuilder/swatches";

export interface Palette { fg: string; bg: string; swatches: string[] }

export const DEFAULT_PALETTE: Palette = { fg: "#000000", bg: "#FFFFFF", swatches: [] };
export const MAX_SWATCHES = 32;

export const swapColors = (p: Palette): Palette => ({ ...p, fg: p.bg, bg: p.fg });

/** The current colour set to `color`; the same palette when it is not a colour. */
export function withFg(p: Palette, color: string): Palette {
  const hex = cleanHex(color);
  return hex === null || hex === p.fg ? p : { ...p, fg: hex };
}

/** `color` saved as a swatch (once; the oldest goes when the row is full). */
export function saveSwatch(p: Palette, color: string): Palette {
  const hex = cleanHex(color);
  if (hex === null || p.swatches.includes(hex)) return p;
  return { ...p, swatches: [...p.swatches, hex].slice(-MAX_SWATCHES) };
}

export const dropSwatch = (p: Palette, color: string): Palette => ({ ...p, swatches: p.swatches.filter((c) => c !== color) });

const hexOr = (raw: unknown, fallback: string): string => (typeof raw === "string" ? cleanHex(raw) : null) ?? fallback;

/** A stored palette, validated: bad colours fall back or are dropped. */
export function parsePalette(raw: unknown): Palette {
  const r = (raw ?? {}) as { fg?: unknown; bg?: unknown; swatches?: unknown };
  const list = Array.isArray(r.swatches) ? r.swatches : [];
  const swatches = [...new Set(list.map((c) => hexOr(c, "")).filter((c) => c !== ""))].slice(-MAX_SWATCHES);
  return { fg: hexOr(r.fg, DEFAULT_PALETTE.fg), bg: hexOr(r.bg, DEFAULT_PALETTE.bg), swatches };
}

const two = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** A colour as the browser reports it (`rgb(…)`, `#abc`, `#aabbcc`) as `#RRGGBB`; null for none / transparent. */
export function cssToHex(css: string): string | null {
  const t = css.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t);
  if (short !== null) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+%?))?\s*\)$/i.exec(t);
  if (rgb === null) return cleanHex(t);
  if (rgb[4] !== undefined && Number.parseFloat(rgb[4]) === 0) return null;
  return `#${two(Number(rgb[1]))}${two(Number(rgb[2]))}${two(Number(rgb[3]))}`.toUpperCase();
}
