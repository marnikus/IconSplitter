// layout.ts — pure artboard geometry (reference "Glyph" containment chain:
// artboard → free area → grid → icon box → glyph + stroke). The same layout
// drives the live preview, its overlays and the exported SVG (RULE 15).
import type { CellFrame, Rect, SheetConfig, SheetLayout } from "./types";

interface GridBox { box: number; gapX: number; gapY: number; caption: number; scale: number }

export function computeLayout(config: SheetConfig): SheetLayout {
  const banner = bannerRect(config);
  const content = contentRect(config, banner);
  const fit = fitGrid(config, content);
  const { columns, rows } = config.grid;
  const width = columns * fit.box + (columns - 1) * fit.gapX;
  const height = rows * (fit.box + fit.caption) + (rows - 1) * fit.gapY;
  const grid: Rect = { x: content.x + (content.width - width) / 2, y: content.y + (content.height - height) / 2, width, height };
  return { content, banner, grid, cells: cellsOf(config, grid, fit), fitScale: fit.scale,
    overflow: fit.scale < 0.999, capacity: columns * rows };
}

/** Caption row height at scale 1: `max(captionSize × 1.65, 10) + 7` when captions are on. */
export function captionRow(config: SheetConfig): number {
  return config.grid.captions ? Math.max(config.grid.captionSize * 1.65, 10) + 7 : 0;
}

function bannerRect(config: SheetConfig): Rect | null {
  const { width, height } = config.artboard;
  const { size, position } = config.banner;
  if (position === "none") return null;
  if (position === "left") return { x: 0, y: 0, width: size, height };
  if (position === "right") return { x: width - size, y: 0, width: size, height };
  if (position === "top") return { x: 0, y: 0, width, height: size };
  return { x: 0, y: height - size, width, height: size };
}

/** Artboard minus the banner, then inset by the padding on every side. */
function contentRect(config: SheetConfig, banner: Rect | null): Rect {
  const { width, height, padding } = config.artboard;
  const free: Rect = { x: 0, y: 0, width, height };
  const pos = config.banner.position;
  if (banner !== null && pos === "left") Object.assign(free, { x: banner.width, width: width - banner.width });
  if (banner !== null && pos === "right") free.width = width - banner.width;
  if (banner !== null && pos === "top") Object.assign(free, { y: banner.height, height: height - banner.height });
  if (banner !== null && pos === "bottom") free.height = height - banner.height;
  return { x: free.x + padding, y: free.y + padding,
    width: Math.max(1, free.width - padding * 2), height: Math.max(1, free.height - padding * 2) };
}

/** The grid only shrinks to fit (scale ≤ 1), never grows; box, gaps and caption row scale together. */
function fitGrid(config: SheetConfig, content: Rect): GridBox {
  const { columns, rows, gapX, gapY } = config.grid;
  const box = config.icons.box;
  const caption = captionRow(config);
  const naturalW = columns * box + (columns - 1) * gapX;
  const naturalH = rows * (box + caption) + (rows - 1) * gapY;
  const scale = Math.min(1, content.width / naturalW, content.height / naturalH);
  return { box: box * scale, gapX: gapX * scale, gapY: gapY * scale, caption: caption * scale, scale };
}

function cellsOf(config: SheetConfig, grid: Rect, fit: GridBox): CellFrame[] {
  const { columns, rows, captionSize } = config.grid;
  const glyph = Math.max(4, fit.box - config.icons.strokeWidth * 2.2);
  const fontSize = Math.max(3.4, captionSize * fit.scale);
  const captionTop = Math.max(3, captionSize * 0.86 * fit.scale);
  return Array.from({ length: columns * rows }, (_, index) => {
    const x = grid.x + (index % columns) * (fit.box + fit.gapX);
    const y = grid.y + Math.floor(index / columns) * (fit.box + fit.caption + fit.gapY);
    return { index, x, y, size: fit.box, glyph, captionSize: fontSize, captionY: y + fit.box + captionTop + fontSize * 0.83 };
  });
}
