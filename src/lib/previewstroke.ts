// previewstroke.ts — the preview-only stroke width of the Generate SVG tab
// (2026-10-19, docs/archive/2026-10-19-svg-preview-stroke). One value for every
// row thumbnail, in SCREEN pixels (non-scaling stroke), so files with different
// viewBox sizes show the same visible width; null means "default" — each file
// shows its own widths. Saved files are never touched: this only builds the CSS
// the preview's shared stylesheet carries.

export const STROKE_MIN = 0;
export const STROKE_MAX = 50;

export type StrokeInput = { ok: true; px: number | null } | { ok: false };

/** Into 0–50, rounded to 0.1. */
export function clampStroke(px: number): number {
  const bounded = Math.min(STROKE_MAX, Math.max(STROKE_MIN, px));
  return Math.round(bounded * 10) / 10;
}

/** The field's text: empty or "default" is default, a number (opt. "px", comma decimal) is clamped. */
export function parseStrokeInput(text: string): StrokeInput {
  const t = text.trim().toLowerCase();
  if (t === "" || t === "default") return { ok: true, px: null };
  const num = t.replace(/px$/, "").trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(num) || num === ".") return { ok: false };
  return { ok: true, px: clampStroke(Number(num)) };
}

/** A persisted value, validated on read (RULE 13): anything but a finite number is default. */
export function parseStoredStroke(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? clampStroke(raw) : null;
}

export function strokeLabel(px: number | null): string {
  return px === null ? "default" : `${px} px`;
}

/**
 * `!important` beats presentation attributes, inline style and the file's own
 * <style>. Non-scaling: in document units a 256- and a 1024-unit viewBox drew
 * the same number 4× apart (user report, v4 vs v5/v6 of one pair).
 */
export function strokeCss(px: number | null): string {
  return px === null ? "" : `svg, svg * { stroke-width: ${px}px !important; vector-effect: non-scaling-stroke !important; }`;
}
