// layout.ts — where every part of the sheet goes (design §5.2). Pure arithmetic
// over the sheet's own numbers: no DOM, no measuring, no guessing. The reference
// implementation measured elements to decide the fit; that cannot be reproduced
// (and is why its exporter was rejected), so the grid is fitted analytically
// instead and the answer is the same one the serializer writes.
//
// The one rule that matters: the grid never leaves the padded content. When the
// configured grid does not fit, it SHRINKS and says `overflow: true` — it never
// silently clips, and it never reflows a cell to a different index (an index is a
// position in the sheet, not a slot in a list).

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CellFrame {
  /** Cell position in the sheet — 0 is the first cell, row by row. */
  index: number;
  column: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** The side of the square the artwork may fill. */
  iconSize: number;
  /** The caption block under the artwork (0 when captions are off). */
  captionHeight: number;
}

export interface SheetLayout {
  /** The artboard rect minus the banner's side. */
  content: Rect;
  /** The banner's own rect, null when there is no banner. */
  banner: Rect | null;
  /** The fitted grid's rect, null when the artboard made it impossible. */
  grid: Rect | null;
  cells: CellFrame[];
  /** 1 exactly when the grid fits as configured; below 1 when it had to shrink. */
  fitScale: number;
  overflow: boolean;
  /** columns × rows — how many icons the sheet can hold at all. */
  capacity: number;
}

export interface LayoutConfig {
  artboard: { width: number; height: number; padding: number; radius: number; background: string };
  grid: { columns: number; rows: number; gapX: number; gapY: number; captions: boolean; captionSize: number };
  icons: { box: number };
  banner: { position: "left" | "right" | "top" | "bottom" | "none"; size: number };
}

/** The banner's rect on its own side, or null for "none". */
function bannerRect(b: LayoutConfig["banner"], a: { width: number; height: number }): Rect | null {
  const size = bannerSize(b, a);
  if (b.position === "left") return { left: 0, top: 0, width: size, height: a.height };
  if (b.position === "right") return { left: a.width - size, top: 0, width: size, height: a.height };
  if (b.position === "top") return { left: 0, top: 0, width: a.width, height: size };
  if (b.position === "bottom") return { left: 0, top: a.height - size, width: a.width, height: size };
  return null;
}

/** A banner is clamped to the axis it occupies, so it can never overhang. */
function bannerSize(b: LayoutConfig["banner"], a: { width: number; height: number }): number {
  const axis = b.position === "left" || b.position === "right" ? a.width : a.height;
  return clamp(b.size, 0, Math.max(0, axis));
}

/** The artboard minus the banner's side — where everything else may go. */
function contentRect(b: LayoutConfig["banner"], a: { width: number; height: number }): Rect {
  const size = bannerSize(b, a);
  if (b.position === "none") return { left: 0, top: 0, width: a.width, height: a.height };
  const vertical = b.position === "left" || b.position === "right";
  return {
    left: b.position === "left" ? size : 0,
    top: b.position === "top" ? size : 0,
    width: a.width - (vertical ? size : 0),
    height: a.height - (b.position === "top" || b.position === "bottom" ? size : 0),
  };
}

/** The content minits padding — the only area a cell may occupy. */
export function insidesOf(c: LayoutConfig): Rect {
  const content = contentRect(c.banner, c.artboard);
  const pad = clamp(c.artboard.padding, 0, Math.max(content.width, content.height));
  return {
    left: content.left + pad,
    top: content.top + pad,
    width: Math.max(1, content.width - pad * 2),
    height: Math.max(1, content.height - pad * 2),
  };
}

/** The whole sheet: banner, content, the fitted grid and every cell frame. */
export function computeLayout(c: LayoutConfig): SheetLayout {
  const inner = insidesOf(c);
  const banner = bannerRect(c.banner, c.artboard);
  const capacity = Math.max(1, Math.round(c.grid.columns) * Math.round(c.grid.rows));
  const captionBlock = captionBlockOf(c);
  const cellW = c.icons.box;
  const cellH = c.icons.box + captionBlock;
  const raw = gridSize(c, cellW, cellH);
  const fitScale = fitOf(raw, inner);
  const cells = framesOf(c, inner, fitScale, captionBlock);
  return {
    content: contentRect(c.banner, c.artboard),
    banner,
    grid: gridRect(inner, raw, fitScale),
    cells,
    fitScale,
    overflow: fitScale < 0.999,
    capacity,
  };
}

/** The caption block inside one cell — its own height, before the fit scale. */
function captionBlockOf(c: LayoutConfig): number {
  return c.grid.captions ? Math.max(c.grid.captionSize * 1.65, 10) + 7 : 0;
}

/** The grid's untransformed size, gaps included. */
function gridSize(c: LayoutConfig, cellW: number, cellH: number): { width: number; height: number } {
  const cols = c.grid.columns;
  const rows = c.grid.rows;
  return {
    width: cols * cellW + Math.max(0, cols - 1) * c.grid.gapX,
    height: rows * cellH + Math.max(0, rows - 1) * c.grid.gapY,
  };
}

/** How much the grid must shrink to fit; never above 1 (never blow artwork up). */
function fitOf(raw: { width: number; height: number }, inner: Rect): number {
  const byW = inner.width / Math.max(raw.width, 1);
  const byH = inner.height / Math.max(raw.height, 1);
  return Math.max(0, Math.min(1, byW, byH));
}

/** The fitted grid, centred in the padded content. */
function gridRect(inner: Rect, raw: { width: number; height: number }, fit: number): Rect {
  const width = raw.width * fit;
  const height = raw.height * fit;
  return {
    left: inner.left + (inner.width - width) / 2,
    top: inner.top + (inner.height - height) / 2,
    width,
    height,
  };
}

/** Every cell frame, row by row, inside the fitted grid. */
function framesOf(c: LayoutConfig, inner: Rect, fit: number, captionBlock: number): CellFrame[] {
  const grid = gridRect(inner, gridSize(c, c.icons.box, c.icons.box + captionBlock), fit);
  const stepX = (c.icons.box + c.grid.gapX) * fit;
  const stepY = (c.icons.box + captionBlock + c.grid.gapY) * fit;
  const out: CellFrame[] = [];
  const capacity = Math.max(1, Math.round(c.grid.columns) * Math.round(c.grid.rows));
  for (let index = 0; index < capacity; index += 1) {
    const column = index % c.grid.columns;
    const row = Math.floor(index / c.grid.columns);
    out.push({
      index,
      column,
      row,
      left: grid.left + column * stepX,
      top: grid.top + row * stepY,
      width: c.icons.box * fit,
      height: (c.icons.box + captionBlock) * fit,
      iconSize: c.icons.box * fit,
      captionHeight: captionBlock * fit,
    });
  }
  return out;
}

/** A finite number inside [lo, hi]; junk becomes `lo`, never NaN. */
function clamp(n: number, lo: number, hi: number): number {
  const v = Number.isFinite(n) ? n : lo;
  return Math.max(lo, Math.min(hi, v));
}

/** The banner title, word-wrapped to `maxChars`, at most three lines. */
export function wrapTitle(title: string, maxChars: number): string[] {
  if (title === "") return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of title.split(/\s+/).filter((w) => w !== "")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (candidate.length > maxChars && line !== "") {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== "") lines.push(line);
  return lines.slice(0, 3);
}
