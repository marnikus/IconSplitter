// sheetsel.ts — Single-sheets selection maths: which sheets export, which
// icons inside them are included, which sheets a merge-distance change
// reaches, and the merge distance shown to the user as a percentage.
import type { Box } from "./detect";

/** The merge slider's ceiling: a fraction of the sheet's longest side. */
export const MERGE_MAX_FRAC = 0.15;

export interface SheetPick { id: string; boxes: Box[]; excluded: number[] }

/** Included icons in detection order; `i` is the detection index. */
export function includedBoxes(sheet: SheetPick): { b: Box; i: number }[] {
  return sheet.boxes.map((b, i) => ({ b, i })).filter((x) => !sheet.excluded.includes(x.i));
}

/** Checked sheets in list order (I-1: exactly what an export contains). */
export function exportSheets<T extends SheetPick>(sheets: readonly T[], checked: readonly string[]): T[] {
  return sheets.filter((s) => checked.includes(s.id));
}

export function exportTotal(sheets: readonly SheetPick[], checked: readonly string[]): number {
  return exportSheets(sheets, checked).reduce((a, s) => a + includedBoxes(s).length, 0);
}

/** A merge change on a checked sheet reaches every checked sheet; otherwise only that sheet. */
export function mergeTargets(sheets: readonly SheetPick[], checked: readonly string[], activeId: string | null): string[] {
  if (!activeId || !sheets.some((s) => s.id === activeId)) return [];
  if (!checked.includes(activeId)) return [activeId];
  return exportSheets(sheets, checked).map((s) => s.id);
}

export function toggleIndex(list: readonly number[], idx: number): number[] {
  return list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx];
}

/** Fraction → percent of the longest side, rounded to the shown precision. */
export function fracToPercent(frac: number): number {
  return Math.round(frac * 10000) / 100;
}

/** A typed percent → a clamped fraction; non-finite input yields null. */
export function percentToFrac(percent: number): number | null {
  if (!Number.isFinite(percent)) return null;
  return Math.min(MERGE_MAX_FRAC, Math.max(0, percent / 100));
}
