// svgcomposite.ts — contact-sheet layout math for a batch (RULE 1, prompt §3).
// Owns: the square canvas size, the equal-size cells, and the aspect-preserving
// centred rect each source image is drawn into. Pure numbers in, pure numbers
// out — the canvas drawing lives in svgcanvas.ts.

export interface CellRect {
  position: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CompositeLayout {
  /** Canvas side in px (square, as the prompt requires). */
  size: number;
  cols: number;
  rows: number;
  /** Side of one cell; every cell is the same square. */
  cell: number;
  padding: number;
  cells: CellRect[];
  empty: number[];
}

/** What one sheet cell is made of: the source's identity and its revision. */
export interface SheetSource {
  id: string;
  /** `size:mtime` of the source file when the sheet was drawn. */
  fingerprint: string;
}

/**
 * The identity of a contact sheet: the page label PLUS every source it draws,
 * in the order it draws them, with each source's fingerprint. A page label
 * alone repeats between selections (both single-icon plans are `batch_1_1`),
 * so a cache keyed by it would serve one selection's sheet for another's — the
 * preview would show the first icon the dialog ever built, not the one the
 * request will carry.
 */
export function compositeSheetKey(planId: string, sources: readonly SheetSource[]): string {
  const parts = sources.map((s) => `${s.id}:${s.fingerprint}`);
  return `${planId}|${parts.join("|")}`;
}

export interface CompositeOpts {
  /** Cell side in px before padding; the canvas is cell * max(cols, rows). */
  cell?: number;
  padding?: number;
  /** Upper bound for the canvas side (keeps the request payload small). */
  max?: number;
}

export const DEFAULT_CELL = 256;
export const DEFAULT_PADDING = 12;
export const DEFAULT_MAX = 1024;

/**
 * Layout for `count` images: columns = ceil(sqrt(count)) and the canvas stays
 * square, so a 3-image batch is a 2x2 sheet with the 4th cell empty.
 */
export function compositeLayout(count: number, opts: CompositeOpts = {}): CompositeLayout {
  const cell = positive(opts.cell, DEFAULT_CELL);
  const padding = clampPad(opts.padding, cell);
  const cols = count <= 0 ? 0 : Math.ceil(Math.sqrt(count));
  const rows = count <= 0 ? 0 : Math.ceil(count / cols);
  const side = Math.max(cols, rows) * cell;
  const size = Math.min(side, positive(opts.max, DEFAULT_MAX));
  const scale = size / side;
  const inner = cell * scale - 2 * padding;
  const cells: CellRect[] = [];
  const grid = { cols, cell: cell * scale, inner, pad: padding };
  for (let p = 1; p <= count; p++) cells.push(cellRect(p, grid));
  return { size, cols, rows, cell: cell * scale, padding, cells, empty: emptyList(count, cols * rows) };
}

/** One cell rect: position 1..count placed in row-major grid order. */
function cellRect(position: number, grid: { cols: number; cell: number; inner: number; pad: number }): CellRect {
  const i = position - 1;
  const x = (i % grid.cols) * grid.cell;
  const y = Math.floor(i / grid.cols) * grid.cell;
  return { position, x: x + grid.pad, y: y + grid.pad, w: grid.inner, h: grid.inner };
}

function emptyList(count: number, cells: number): number[] {
  const out: number[] = [];
  for (let p = count + 1; p <= cells; p++) out.push(p);
  return out;
}

/**
 * Aspect-preserving centred fit of a source image inside a square box: never
 * stretched, never cropped, never larger than the box.
 */
export function fitRect(srcW: number, srcH: number, box: CellRect): { x: number; y: number; w: number; h: number } {
  const w = srcW > 0 && srcH > 0 ? srcW : 1;
  const h = srcW > 0 && srcH > 0 ? srcH : 1;
  const scale = Math.min(box.w / w, box.h / h);
  const dw = w * scale;
  const dh = h * scale;
  return { x: box.x + (box.w - dw) / 2, y: box.y + (box.h - dh) / 2, w: dw, h: dh };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampPad(value: number | undefined, cell: number): number {
  const pad = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_PADDING;
  return Math.min(Math.max(0, pad), cell / 4);
}
