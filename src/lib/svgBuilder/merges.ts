// merges.ts — big icons over 2 × 2 cells (2026-11-23). A merge (in the look:
// `config.grid.merges`) names a 2 × 2 square by its top-left cell; `pick` says
// which of its four cells gives the big icon (0 top-left, 1 top-right, 2
// bottom-left, 3 bottom-right), `strokeWidth` its own pen (0 = the sheet's).
//
// The placement list the app STORES is by grid position (one entry per cell);
// everything else sees SLOTS — the cells that are drawn, in grid order, the
// big one where its icon's cell is and the other three of its square left out.
// `toSlots` / `toFull` translate; with no merge both return the list itself.
import { isRecord } from "../isrecord";
import { RANGES, clampTo } from "./ranges";
import { freshEmpty, isEmptySlot, trimTrailingEmpty } from "./slots";
import type { SheetConfig } from "./types";

type Grid = Pick<SheetConfig["grid"], "columns" | "rows" | "merges">;
export type CellMerge = SheetConfig["grid"]["merges"][number];

/** A merge in force: where it is in `grid.merges`, its four positions (TL, TR, BL, BR), the one holding the icon, its own pen. */
export interface ActiveMerge { at: number; cells: [number, number, number, number]; source: number; strokeWidth: number }

const MAX_MERGES = 2500;
const whole = (v: unknown, max: number): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null);

/** Stored merges, rebuilt field by field: a bad position drops the merge, a bad pick or pen falls back. */
export function parseMerges(raw: unknown): CellMerge[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_MERGES).flatMap((m) => {
    if (!isRecord(m)) return [];
    const col = whole(m.col, RANGES.columns.max - 2), row = whole(m.row, RANGES.rows.max - 2);
    if (col === null || row === null) return [];
    const pen = typeof m.strokeWidth === "number" && m.strokeWidth > 0 ? clampTo(RANGES.strokeWidth, m.strokeWidth) : 0;
    return [{ col, row, pick: whole(m.pick, 3) ?? 0, strokeWidth: pen }];
  });
}

/** The merges inside the grid that do not overlap an earlier one, in order. */
export function activeMerges(grid: Grid): ActiveMerge[] {
  const { columns, rows } = grid;
  const taken = new Set<number>();
  const out: ActiveMerge[] = [];
  for (const [at, m] of grid.merges.entries()) {
    if (m.col + 1 >= columns || m.row + 1 >= rows) continue;
    const tl = m.row * columns + m.col;
    const cells: ActiveMerge["cells"] = [tl, tl + 1, tl + columns, tl + columns + 1];
    if (cells.some((c) => taken.has(c))) continue;
    cells.forEach((c) => taken.add(c));
    out.push({ at, cells, source: cells[m.pick] ?? tl, strokeWidth: m.strokeWidth });
  }
  return out;
}

/** The positions hidden under big icons (each square's three cells besides its icon's). */
export function coveredPositions(grid: Grid): Set<number> {
  return new Set(activeMerges(grid).flatMap((m) => m.cells.filter((c) => c !== m.source)));
}

/** The drawn cells' grid positions, in order: slot k is position `visiblePositions(grid)[k]`. */
export function visiblePositions(grid: Grid): number[] {
  const covered = coveredPositions(grid);
  return Array.from({ length: grid.columns * grid.rows }, (_, i) => i).filter((i) => !covered.has(i));
}

/** Holes (undefined) filled with placeholder ids no other entry uses. */
function filled(list: readonly (string | undefined)[]): string[] {
  const fresh = freshEmpty(list.filter((id): id is string => id !== undefined), list.filter((id) => id === undefined).length);
  let k = 0;
  return list.map((id) => id ?? fresh[k++]);
}

/** Stored list → slots. A repeat (an icon revealed twice) becomes an empty cell: a repeat would shift every later cell. */
export function toSlots(full: readonly string[], grid: Grid): readonly string[] {
  if (grid.merges.length === 0 || activeMerges(grid).length === 0) return full;
  const seen = new Set<string>();
  const slots = visiblePositions(grid).map((pos) => {
    const id = full[pos];
    if (id === undefined || isEmptySlot(id) || seen.has(id)) return undefined;
    seen.add(id);
    return id;
  });
  return trimTrailingEmpty(filled(slots));
}

/** Slots → stored list: every slot goes back to its position; the hidden positions keep what they held (`prev`). */
export function toFull(slots: readonly string[], grid: Grid, prev: readonly string[]): readonly string[] {
  if (grid.merges.length === 0 || activeMerges(grid).length === 0) return slots;
  const out: (string | undefined)[] = Array.from({ length: grid.columns * grid.rows }, (_, pos) => prev[pos]);
  const visible = visiblePositions(grid);
  visible.forEach((pos, k) => { out[pos] = slots[k]; });
  return trimTrailingEmpty(filled(out));
}

/** Four marked positions forming a 2 × 2 square inside the grid → its merge (the first marked gives the icon); else null. */
export function mergeFromMarks(marks: readonly number[], grid: Pick<Grid, "columns" | "rows">): CellMerge | null {
  if (marks.length !== 4 || new Set(marks).size !== 4) return null;
  const { columns, rows } = grid;
  const tl = Math.min(...marks);
  const col = tl % columns, row = Math.floor(tl / columns);
  if (col + 1 >= columns || row + 1 >= rows) return null;
  const square = [tl, tl + 1, tl + columns, tl + columns + 1];
  if (!square.every((c) => marks.includes(c))) return null;
  return { col, row, pick: square.indexOf(marks[0]), strokeWidth: 0 };
}
