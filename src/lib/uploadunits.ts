// uploadunits.ts — the ONE place px/pt/mm/in are converted (RULE 16: one
// authority). The brief fixes the default stroke width at 2.2 pt and the JPEG
// target at 15.1 MP; the DPI is an explicit setting, never an assumption made
// silently by the renderer, and every conversion is written out in export.json
// so a later reader can reproduce the number.

export type StrokeUnit = "px" | "pt" | "mm" | "in";

export const STROKE_UNITS: readonly StrokeUnit[] = ["px", "pt", "mm", "in"];
export const PT_PER_INCH = 72;
export const MM_PER_INCH = 25.4;
export const DEFAULT_DPI = 300;

const PER_INCH: Record<StrokeUnit, number> = {
  px: 0, // filled in below: px/in is the DPI itself
  pt: PT_PER_INCH,
  mm: MM_PER_INCH,
  in: 1,
};

/** The unit's own scale, in device pixels, at this DPI. */
export function pxPerUnit(unit: StrokeUnit, dpi: number): number {
  return unit === "px" ? 1 : dpi / PER_INCH[unit];
}

export function unitToPx(value: number, unit: StrokeUnit, dpi: number): number {
  return value * pxPerUnit(unit, dpi);
}

export function pxToUnit(px: number, unit: StrokeUnit, dpi: number): number {
  return px / pxPerUnit(unit, dpi);
}

/** "2.2 pt" — one wording, so the settings panel and export.json agree. */
export function formatStroke(value: number, unit: StrokeUnit): string {
  return `${trim(value)} ${unit}`;
}

/** Accepts "2.2 pt", "2,2pt", "2.2" (unit omitted → px). */
export function parseStroke(text: string): { value: number; unit: StrokeUnit } | null {
  const match = text.trim().toLowerCase().match(/^([0-9]*[.,]?[0-9]+)\s*(px|pt|mm|in)?$/);
  if (match === null) return null;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, unit: (match[2] as StrokeUnit | undefined) ?? "px" };
}

/** Millimetres at this DPI, for the record's print-size line. */
export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH;
}

/** The physical size of an artboard as it would print: "13.15 × 13.15 in". */
export function physicalSize(px: number, dpi: number): string {
  const inches = px / dpi;
  return `${trim(inches)} × ${trim(inches)} in`;
}

export function trim(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}
