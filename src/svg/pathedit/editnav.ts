// editnav.ts — ← / → in edit mode (2026-11-06): the previous / next row of the
// list, in the order the list shows it, that can be edited. Never wraps.

import { previewTargetOf } from "../rowmodel";
import type { SvgRow } from "../types";

/** A row the edit mode can open: a drawn SVG and no run writing it (also Enter / double-click in the list). */
export const editableRow = (r: SvgRow): boolean => previewTargetOf(r) !== null && !r.running && !r.queued;

/** The nearest editable row before (-1) or after (+1) `id`; null at the end. */
export function neighborRow<R extends { source: { id: string } }>(rows: readonly R[], id: string, dir: 1 | -1, editable: (r: R) => boolean): R | null {
  const at = rows.findIndex((r) => r.source.id === id);
  for (let i = at + dir; i >= 0 && i < rows.length; i += dir) if (editable(rows[i])) return rows[i];
  return null;
}
