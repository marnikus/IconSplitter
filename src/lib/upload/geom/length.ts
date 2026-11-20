// length.ts — one CSS length, in user units (RULE 3: pure math lives in lib).
// The app writes tracking in em (`letter-spacing="0.025em"`); `Number("0.025em")`
// is NaN, so every reader that assumed a bare number silently lost the value
// (2026-11-19: Title/Subtitle spacing arrived at the exporter as 0).
const RELATIVE: Record<string, number> = { em: 1, rem: 1, ex: 0.5, ch: 0.5, "%": 0.01 };
const ABSOLUTE: Record<string, number> = { "": 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

/**
 * The length in user units, `base` (a font size) resolving em/rem/ex/ch/%.
 * Signed — letter-spacing may be negative. Null when the text is not a length.
 */
export function lengthPx(raw: string | null, base: number): number | null {
  if (raw === null) return null;
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(raw);
  if (match === null) return null;
  const unit = match[2].toLowerCase();
  const factor = RELATIVE[unit];
  const px = factor === undefined
    ? Number(match[1]) * (ABSOLUTE[unit] ?? NaN)
    : Number(match[1]) * factor * base;
  return Number.isFinite(px) ? px : null;
}
