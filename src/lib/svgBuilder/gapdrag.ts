// gapdrag.ts — the gaps between icons as draggable strips on the artboard
// (2026-11-14). One strip per pair of neighbouring cells: between columns
// (Gap X) and between rows (Gap Y), in artboard pixels. At least `MIN` wide,
// so a zero gap can still be caught. Pure geometry.
import { RANGES, clampTo } from "./ranges";
import type { CellFrame, Rect, SheetConfig } from "./types";

export interface GapStrip { id: string; axis: "x" | "y"; zone: Rect }

const MIN = 12;

/** A strip from `from` to `to` along the axis, widened to MIN around its middle. */
function band(from: number, to: number): { start: number; size: number } {
  const size = Math.max(MIN, to - from);
  return { start: (from + to) / 2 - size / 2, size };
}

function xStrip(a: CellFrame, b: CellFrame, gap: number): GapStrip {
  const s = band(b.x - gap, b.x);
  return { id: `x-${a.index}`, axis: "x", zone: { x: s.start, y: a.y, width: s.size, height: a.size } };
}

function yStrip(a: CellFrame, b: CellFrame, gap: number): GapStrip {
  const s = band(b.y - gap, b.y);
  return { id: `y-${a.index}`, axis: "y", zone: { x: a.x, y: s.start, width: a.size, height: s.size } };
}

/** Every gap between neighbouring cells, as the sheet draws it (gaps scale with the grid's fit). */
export function gapStrips(config: SheetConfig, layout: { cells: readonly CellFrame[]; fitScale: number }): GapStrip[] {
  const { columns } = config.grid;
  const gx = config.grid.gapX * layout.fitScale, gy = config.grid.gapY * layout.fitScale;
  const out: GapStrip[] = [];
  // by grid position (2026-11-23): a big icon's cell and the cells it covers have no gap strips
  const plain = new Map(layout.cells.filter((c) => c.span === undefined).map((c) => [c.pos ?? c.index, c]));
  for (const [pos, c] of plain) {
    const right = plain.get(pos + 1);
    const below = plain.get(pos + columns);
    if (right !== undefined && (pos + 1) % columns !== 0) out.push(xStrip(c, right, gx));
    if (below !== undefined) out.push(yStrip(c, below, gy));
  }
  return out;
}

/** The gap after dragging a strip by (dx, dy) screen-free artboard pixels; the grid's fit is undone. */
export function gapAfter(axis: "x" | "y", start: number, d: { dx: number; dy: number }, fitScale: number): number {
  const moved = (axis === "x" ? d.dx : d.dy) / Math.max(0.05, fitScale);
  return Math.round(clampTo(axis === "x" ? RANGES.gapX : RANGES.gapY, start + moved));
}
