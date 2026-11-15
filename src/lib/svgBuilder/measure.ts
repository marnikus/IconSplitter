// measure.ts — a banner text's REAL ink box (2026-11-15): where its glyphs'
// ink starts (relative to the text's x) and how wide that ink is, measured with
// the browser's canvas in the same font, weight and letter spacing the sheet
// draws (markup.ts `fontFamily`). Without a canvas (Node lanes, tests) it falls
// back to the per-character estimate. Tests may install their own measurer.
import { fontFamily } from "./markup";
import type { TitleFace } from "./types";

export interface InkBox { width: number; left: number }
export interface InkStyle { face: TitleFace; weight: number; spacingEm: number; perChar: number }
export type TextMeasurer = (text: string, size: number, style: InkStyle) => InkBox | null;

let custom: TextMeasurer | null = null;
let ctx: CanvasRenderingContext2D | null | undefined;

/** Tests: a deterministic measurer; null = the browser's again. */
export function setTextMeasurer(m: TextMeasurer | null): void {
  custom = m;
}

function canvas(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try { ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d"); } catch { ctx = null; }
  return ctx;
}

function canvasInk(text: string, size: number, style: InkStyle): InkBox | null {
  const c = canvas();
  if (c === null || typeof c.measureText !== "function") return null;
  c.font = `${style.weight} ${size}px ${fontFamily(style.face)}`;
  const m = c.measureText(text);
  if (!Number.isFinite(m.actualBoundingBoxRight) || m.actualBoundingBoxRight <= 0) return null;
  const spacing = style.spacingEm * size * Math.max(0, text.length - 1); // canvas draws no letter-spacing here
  return { width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight + spacing, left: -m.actualBoundingBoxLeft };
}

/** The ink box of `text` at `size`: measured when possible, else estimated. */
export function inkBox(text: string, size: number, style: InkStyle): InkBox {
  const measured = (custom ?? canvasInk)(text, size, style);
  return measured ?? { width: text.length * size * style.perChar, left: 0 };
}
