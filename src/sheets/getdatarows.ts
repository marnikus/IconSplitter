// getdatarows.ts — Single sheets' checked sheets for "Get data" (2026-11-10): the
// image's file name (an upload has no folder, so no path) and how many of the
// detected icons are kept.

import type { DataRow } from "../lib/getdata";
import type { Sheet } from "./importSheets";

export function sheetDataRows(sheets: readonly Pick<Sheet, "id" | "name" | "boxes" | "excluded">[], checked: readonly string[]): DataRow[] {
  const on = new Set(checked);
  return sheets.filter((s) => on.has(s.id)).map((s) => ({
    svg: null, png: { name: s.name, path: "" }, status: [`${s.boxes.length - s.excluded.length} of ${s.boxes.length} icons`],
  }));
}
