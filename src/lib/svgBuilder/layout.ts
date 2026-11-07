// layout.ts — pure artboard geometry. The same layout drives the live preview
// and the exported SVG, so a cell can never drift between what is shown and
// what is delivered (RULE 15).
import type { BannerPosition, CellFrame, Rect, SheetConfig, SheetLayout } from "./types";

const MAX_CELLS = 400;

export function computeLayout(config: SheetConfig, count: number): SheetLayout {
  const capacity = Math.min(MAX_CELLS, config.grid.columns * config.grid.rows);
  const placed = Math.max(0, Math.min(count, capacity));
  const banner = bannerRect(config);
  const content = contentRect(config, banner);
  const size = cellSize(config, content);
  const grid = gridRect(config, content, size);
  return {
    content, banner, grid, cells: cellsOf(config, grid, size, placed),
    fitScale: 1, overflow: count > capacity, capacity,
  };
}

export function wrapTitle(title: string, maxChars: number): string[] {
  const words = title.trim().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return [];
  return words.reduce<string[]>((lines, word) => {
    const at = lines.length - 1;
    const next = lines[at] === "" ? word : `${lines[at]} ${word}`;
    if (next.length <= maxChars || lines[at] === "") lines[at] = next;
    else lines.push(word);
    return lines;
  }, [""]);
}

function bannerRect(config: SheetConfig): Rect | null {
  const { width, height } = config.artboard;
  const size = config.banner.size;
  const by: Record<Exclude<BannerPosition, "none">, Rect> = {
    left: { x: 0, y: 0, width: size, height },
    right: { x: width - size, y: 0, width: size, height },
    top: { x: 0, y: 0, width, height: size },
    bottom: { x: 0, y: height - size, width, height: size },
  };
  return config.banner.position === "none" ? null : by[config.banner.position];
}

function contentRect(config: SheetConfig, banner: Rect | null): Rect {
  const { width, height, padding } = config.artboard;
  const full: Rect = { x: padding, y: padding, width: width - padding * 2, height: height - padding * 2 };
  if (banner === null) return full;
  return shrink(full, config.banner.position, banner, padding);
}

function shrink(full: Rect, position: BannerPosition, banner: Rect, padding: number): Rect {
  if (position === "left") return { ...full, x: banner.width + padding, width: full.x + full.width - banner.width - padding };
  if (position === "right") return { ...full, width: banner.x - padding - full.x };
  if (position === "top") return { ...full, y: banner.height + padding, height: full.y + full.height - banner.height - padding };
  if (position === "bottom") return { ...full, height: banner.y - padding - full.y };
  return full;
}

function cellSize(config: SheetConfig, content: Rect): number {
  const { columns, rows, gapX, gapY, captions, captionSize } = config.grid;
  const captionGap = captions ? captionSize + 10 : 0;
  const byWidth = (content.width - (columns - 1) * gapX) / columns;
  const byHeight = (content.height - (rows - 1) * (gapY + captionGap)) / rows - captionGap;
  return Math.max(16, Math.min(config.icons.box, byWidth, byHeight));
}

function gridRect(config: SheetConfig, content: Rect, size: number): Rect | null {
  const { columns, rows, gapX, gapY, captions, captionSize } = config.grid;
  const captionGap = captions ? captionSize + 10 : 0;
  const width = columns * size + (columns - 1) * gapX;
  const height = rows * size + (rows - 1) * (gapY + captionGap);
  return { x: content.x + Math.max(0, (content.width - width) / 2),
    y: content.y + Math.max(0, (content.height - height) / 2), width, height };
}

function cellsOf(config: SheetConfig, grid: Rect | null, size: number, count: number): CellFrame[] {
  if (grid === null) return [];
  const { columns, gapX, gapY, captionSize, captions } = config.grid;
  const captionGap = captions ? captionSize + 10 : 0;
  return Array.from({ length: count }, (_, index) => {
    const x = grid.x + (index % columns) * (size + gapX);
    const y = grid.y + Math.floor(index / columns) * (size + gapY + captionGap);
    return { index, x, y, size, captionY: y + size + captionSize + 4 };
  });
}
