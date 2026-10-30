// svgimgbatch.ts — image-edit sheet identity and normalized crop geometry.
// The editor may resize a square response; only saved slot coordinates, never
// visual guesses or the current list order, decide which pair receives a crop.

export interface ImageEditSource {
  id: string;
  name: string;
  fingerprint: string;
}

export interface NormalizedCell { x: number; y: number; w: number; h: number }
export interface ImageEditCell extends ImageEditSource {
  position: number;
  rect: NormalizedCell;
}
export interface ImageEditGroup {
  cells: ImageEditCell[];
  empty: number[];
  cols: number;
  size: number;
}
export interface PixelRect { x: number; y: number; w: number; h: number }

/** A tested 256-pixel minimum cell, with an explicit browser-safety ceiling. */
export const MIN_EDIT_CELL = 256;
export const MAX_EDIT_COUNT = 16;
export const DEFAULT_EDIT_COUNT = 4;

/** An ordered selection is equal only when every original ID still occupies its slot. */
export function sameImageSelection(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function imageEditLimit(side: number): number {
  if (!Number.isInteger(side) || side < MIN_EDIT_CELL || side > 4096) return 0;
  return Math.min(MAX_EDIT_COUNT, Math.floor(side / MIN_EDIT_CELL) ** 2);
}

/** Capture one row-major plan; empty slots have no source and are never saved. */
export function planImageEditGroups(sources: readonly ImageEditSource[], perRequest: number, side: number): ImageEditGroup[] {
  const limit = imageEditLimit(side);
  if (!Number.isInteger(perRequest) || perRequest < 1) throw new Error("Image-edit count must be a positive integer");
  if (perRequest > limit) throw new Error(`Image-edit count exceeds the limit of ${limit} at ${side}px`);
  if (new Set(sources.map((s) => s.id)).size !== sources.length) throw new Error("Duplicate pair identity in image-edit selection");
  if (sources.some((s) => !s.id || !s.name || !s.fingerprint)) throw new Error("A selected image has no safe identity");
  const groups: ImageEditGroup[] = [];
  for (let offset = 0; offset < sources.length; offset += perRequest) {
    groups.push(groupOf(sources.slice(offset, offset + perRequest), side));
  }
  return groups;
}

function groupOf(sources: readonly ImageEditSource[], size: number): ImageEditGroup {
  const cols = Math.ceil(Math.sqrt(sources.length));
  const cells = sources.map((source, index) => ({ ...source, position: index + 1, rect: cellRect(index, cols) }));
  const empty = Array.from({ length: cols * cols - cells.length }, (_, i) => cells.length + i + 1);
  return { cells, empty, cols, size };
}

function cellRect(index: number, cols: number): NormalizedCell {
  return { x: (index % cols) / cols, y: Math.floor(index / cols) / cols, w: 1 / cols, h: 1 / cols };
}

/** Shared rounded boundaries avoid overlaps and gaps after a model resizes the sheet. */
export function returnedCellRect(cell: ImageEditCell, width: number, height: number): PixelRect {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || Math.abs(width - height) > 1) {
    throw new Error("The returned image is not a usable square");
  }
  const { x, y, w, h } = cell.rect;
  const x0 = Math.round(x * width);
  const y0 = Math.round(y * height);
  return { x: x0, y: y0, w: Math.round((x + w) * width) - x0, h: Math.round((y + h) * height) - y0 };
}

/** The exact layout instruction appended to the editable prompt for a multi-icon edit. */
export function compositeEditPrompt(userPrompt: string, cols: number, occupied: number): string {
  return `${userPrompt.trim()}\n\nEdit the provided ${cols}×${cols} icon grid as one image. Make each icon's lines thinner while preserving its identity, colors, orientation, background and the same cell positions in row-major order (1 through ${occupied}). Do not swap, merge, move, add or remove icons. Keep the grid square and leave all ${cols * cols - occupied} empty cells blank. Return exactly one square edited grid, with no text or labels.`;
}
