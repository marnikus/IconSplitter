// units.ts — the ONE length rule of the "SVG to upload" tab (design §4 C4/C5).
// Why it exists: a human types `2.2 pt` while the SVG and the raster count user
// units, and the request explicitly forbids treating a point as a mystery pixel.
// The convention is the CSS one (96 px/in, 72 pt/in), declared here so the
// export JSON can record it and a reader can redo the arithmetic.

/** The document resolution both counts derive from (CSS px per inch). */
export const PX_PER_INCH = 96;
/** PostScript points per inch, unchanged since 1886. */
export const PT_PER_INCH = 72;

export type LengthUnit = "pt" | "px" | "%";

export interface Length {
  value: number;
  unit: LengthUnit;
}

/** Points → user units at the declared resolution: 2.2 pt = 2.9333 px. */
export function ptToPx(pt: number): number {
  return (pt * PX_PER_INCH) / PT_PER_INCH;
}

const LENGTH_RE = /^(\d+(?:\.\d+)?)\s*(pt|px|%)$/i;

/**
 * What a human typed: `2.2 pt`, `2.2pt`, `12 PX`, `5%`. A value with no unit, a
 * negative value or anything else is refused (null) rather than guessed — a
 * wrong number in the artboard is worse than a field the user must fix.
 */
export function parseLength(text: string): Length | null {
  const m = LENGTH_RE.exec(text.trim());
  if (m === null) return null;
  return { value: Number(m[1]), unit: m[2].toLowerCase() as LengthUnit };
}

/**
 * The length in user units. `basis` is what a percentage means to the caller —
 * for padding it is the shorter side of the visible bounds, and each caller
 * passes the basis it means rather than a screen assumption.
 */
export function toPx(length: Length, basis: number): number {
  if (length.unit === "pt") return ptToPx(length.value);
  if (length.unit === "%") return (basis * length.value) / 100;
  return length.value;
}

/** How much of the shorter side padding may take before it hides the artwork. */
export const PADDING_CAP_RATIO = 0.45;

/** The ranges the settings form validates against (design §5). */
export const LIMITS = { paddingMax: 50, strokeMax: 50 } as const;

/** Padding can never swallow the icon: capped at 45% of the shorter side. */
export function clampPaddingPx(px: number, shorterSide: number): number {
  if (!Number.isFinite(px) || px <= 0) return 0;
  const cap = Math.abs(shorterSide) * PADDING_CAP_RATIO;
  return Math.min(px, cap);
}
