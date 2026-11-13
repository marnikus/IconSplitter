// guides.ts — the red layout guides drawn over the artboard (2026-11-13), preview
// only, never exported. They show the grid that is working right now: every
// cell's box and the icon's drawing area inside it (the small padding), the box
// edges extended across the whole artboard (so the gaps between icons and the
// margins to the artboard's sides read as bands), the padding boundary and the
// banner edge. Pure geometry from the computed layout.
import type { Rect, SheetLayout } from "./types";

export interface SheetGuides {
  /** x of every column edge (left and right of each box), sorted, unique. */
  vertical: number[];
  /** y of every row edge (top and bottom of each box), sorted, unique. */
  horizontal: number[];
  cells: Rect[];
  /** The icon's drawing area inside each box: `glyph` centred in `size`. */
  glyphs: Rect[];
  /** The artboard minus its padding (and banner): where the grid may live. */
  content: Rect;
  banner: Rect | null;
}

const unique = (values: number[]) => [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

export function sheetGuides(layout: SheetLayout): SheetGuides {
  const cells = layout.cells.map((c) => ({ x: c.x, y: c.y, width: c.size, height: c.size }));
  const glyphs = layout.cells.map((c) => {
    const inset = (c.size - c.glyph) / 2;
    return { x: c.x + inset, y: c.y + inset, width: c.glyph, height: c.glyph };
  });
  return {
    vertical: unique(cells.flatMap((c) => [c.x, c.x + c.width])),
    horizontal: unique(cells.flatMap((c) => [c.y, c.y + c.height])),
    cells, glyphs, content: layout.content, banner: layout.banner,
  };
}
