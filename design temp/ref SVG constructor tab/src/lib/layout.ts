import type { SheetConfig } from "./sheet";

export type Rect = { left: number; top: number; width: number; height: number };
export type CellFrame = {
  index: number;
  column: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
  iconSize: number;
  captionHeight: number;
};

export type SheetLayout = {
  content: Rect;
  banner: Rect | null;
  grid: Rect | null;
  cells: CellFrame[];
  fitScale: number;
  overflow: boolean;
  capacity: number;
};

export function computeLayout(config: SheetConfig): SheetLayout {
  const { artboard, banner: bannerConfig, grid, icons } = config;
  const capacity = Math.max(1, grid.columns * grid.rows);

  let banner: Rect | null = null;
  if (bannerConfig.position === "left") {
    banner = { left: 0, top: 0, width: bannerConfig.size, height: artboard.height };
  } else if (bannerConfig.position === "right") {
    banner = {
      left: artboard.width - bannerConfig.size,
      top: 0,
      width: bannerConfig.size,
      height: artboard.height,
    };
  } else if (bannerConfig.position === "top") {
    banner = { left: 0, top: 0, width: artboard.width, height: bannerConfig.size };
  } else if (bannerConfig.position === "bottom") {
    banner = {
      left: 0,
      top: artboard.height - bannerConfig.size,
      width: artboard.width,
      height: bannerConfig.size,
    };
  }

  const content: Rect = {
    left: bannerConfig.position === "left" ? bannerConfig.size : 0,
    top: bannerConfig.position === "top" ? bannerConfig.size : 0,
    width:
      artboard.width -
      (bannerConfig.position === "left" || bannerConfig.position === "right" ? bannerConfig.size : 0),
    height:
      artboard.height -
      (bannerConfig.position === "top" || bannerConfig.position === "bottom" ? bannerConfig.size : 0),
  };

  const inner: Rect = {
    left: content.left + artboard.padding,
    top: content.top + artboard.padding,
    width: Math.max(1, content.width - artboard.padding * 2),
    height: Math.max(1, content.height - artboard.padding * 2),
  };

  const captionBlock = grid.captions ? Math.max(grid.captionSize * 1.65, 10) + 7 : 0;
  const cellHeight = icons.box + captionBlock;
  const gridWidth = grid.columns * icons.box + (grid.columns - 1) * grid.gapX;
  const gridHeight = grid.rows * cellHeight + (grid.rows - 1) * grid.gapY;
  const fitScale = Math.min(1, inner.width / Math.max(gridWidth, 1), inner.height / Math.max(gridHeight, 1));
  const scaledWidth = gridWidth * fitScale;
  const scaledHeight = gridHeight * fitScale;
  const originX = inner.left + (inner.width - scaledWidth) / 2;
  const originY = inner.top + (inner.height - scaledHeight) / 2;
  const scaledCellWidth = icons.box * fitScale;
  const scaledCellHeight = cellHeight * fitScale;
  const captionHeight = captionBlock * fitScale;

  const cells: CellFrame[] = [];
  for (let index = 0; index < capacity; index += 1) {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    cells.push({
      index,
      column,
      row,
      left: originX + column * (scaledCellWidth + grid.gapX * fitScale),
      top: originY + row * (scaledCellHeight + grid.gapY * fitScale),
      width: scaledCellWidth,
      height: scaledCellHeight,
      iconSize: icons.box * fitScale,
      captionHeight,
    });
  }

  return {
    content,
    banner,
    grid: { left: originX, top: originY, width: scaledWidth, height: scaledHeight },
    cells,
    fitScale,
    overflow: fitScale < 0.999,
    capacity,
  };
}

export function wrapTitle(title: string, maxChars: number) {
  if (!title) return [""];
  const lines: string[] = [];
  let line = "";
  title.split(/\s+/).forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
