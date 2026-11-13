// activeView.ts — what the active sheet's preview shows: every detected icon
// (included or not), each previewed in the shared export square of the
// included icons, so an excluded icon looks exactly as it would export.
import type { Box } from "../lib/detect";
import { renderIcon, squareInfo, type ExportOpts, type SquareInfo } from "../lib/render";
import { includedBoxes } from "../lib/sheetsel";
import type { Sheet } from "./importSheets";

export interface ActiveItem { i: number; b: Box; off: boolean; sq: SquareInfo }

export function activeItems(sheet: Sheet | null, padding: number): ActiveItem[] {
  if (!sheet) return [];
  const inc = includedBoxes(sheet);
  const sq = squareInfo(inc.length ? inc.map((x) => x.b) : sheet.boxes, padding);
  return sheet.boxes.map((b, i) => ({ i, b, off: sheet.excluded.includes(i), sq }));
}

export function activePreviews(sheet: Sheet | null, items: readonly ActiveItem[], opts: ExportOpts): string[] {
  if (!sheet) return [];
  return items.map((it) => renderIcon(sheet.img, sheet.an, sheet.boxes, it.b, it.sq, opts, 260).toDataURL("image/png"));
}
