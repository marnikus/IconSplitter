// bannerrow.ts — the banner's pure row helpers (2026-11-15, split out of
// banner.ts): wrapping a text into at most three lines, and where each part of
// an edge banner row starts (reference centred group, or equal-gap spread).
import type { Rect } from "./types";

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

export interface EdgeParts { hero: number; title: number; rule: boolean; sub: number }
export interface EdgeXs { hero: number; title: number; rule: number; sub: number }

/**
 * Where each part of an edge banner row starts. The reference: one centred group
 * with fixed gaps (glyph + 16, rule 16 | 1 | 16). Spread (2026-11-15, ⇔ Rebalance
 * row): EQUAL gaps between every present part and both edges; the rule is a
 * zero-width part.
 */
export function edgeXs(box: Rect, p: EdgeParts, spread: boolean): EdgeXs {
  if (!spread) {
    const widths = [p.hero > 0 ? p.hero + 16 : 0, p.title, p.rule ? 33 : (p.sub > 0 ? 16 : 0), p.sub];
    const x0 = box.x + (box.width - widths.reduce((s, w) => s + w, 0)) / 2;
    const title = x0 + widths[0];
    return { hero: x0, title, rule: title + p.title + 16, sub: title + p.title + widths[2] };
  }
  const parts: [keyof EdgeXs, number][] = [["hero", p.hero], ["title", p.title], ["rule", p.rule ? 0 : -1], ["sub", p.sub > 0 ? p.sub : -1]];
  const present = parts.filter(([key, w]) => w >= 0 && (key !== "hero" || w > 0));
  const gap = Math.max(0, (box.width - present.reduce((s, [, w]) => s + w, 0)) / (present.length + 1));
  const out: EdgeXs = { hero: box.x, title: box.x, rule: box.x, sub: box.x };
  let x = box.x + gap;
  for (const [key, w] of present) { out[key] = x; x += w + gap; }
  return out;
}
