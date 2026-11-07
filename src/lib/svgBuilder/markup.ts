// markup.ts — tiny escaping and <text> helpers shared by the banner and the
// sheet composer, so every exported string is escaped in exactly one way.
import type { TitleFace } from "./types";

export interface TextSpec {
  x: number; y: number; value: string; size: number; colour: string;
  face: TitleFace; weight: number; anchor?: "start" | "middle" | "end"; spacing?: string;
}

export function textEl(t: TextSpec): string {
  return `<text x="${round(t.x)}" y="${round(t.y)}" fill="${attr(t.colour)}" font-size="${round(t.size)}" `
    + `font-weight="${t.weight}" font-family="${fontFamily(t.face)}" text-anchor="${t.anchor ?? "start"}" `
    + `letter-spacing="${t.spacing ?? "0"}">${escapeText(t.value)}</text>`;
}

/** Grotesk / Editorial / Mono with local fallbacks (the artboard never fetches fonts). */
export function fontFamily(face: TitleFace): string {
  if (face === "serif") return "'Instrument Serif', Georgia, 'Times New Roman', serif";
  if (face === "mono") return "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
  return "'DM Sans', Inter, ui-sans-serif, system-ui, sans-serif";
}

export function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Rough advance width of a text run, for centring rows without a DOM. */
export function textWidth(value: string, size: number, perChar = 0.56): number {
  return value.length * size * perChar;
}
