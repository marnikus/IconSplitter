// grid.ts — the coarse grid the detector works on. Owns: the downscale step that
// caps detection cost (one cell per f x f pixels, f from the longest side), the
// pixel→cell column map both full-image passes use, and each cell's ink count.
// Pure arrays in, arrays out (RULE 1/3). `detect` and the merge series both work
// on a GridMap, so "what is a cell, and how much ink does it hold" is defined once.

export interface Grid {
  gw: number;
  gh: number;
}

export interface GridMap extends Grid {
  /** Pixels per grid edge, >= 1. */
  f: number;
  /** Pixel column → grid column (the two full-image passes pay no division per pixel). */
  col: Uint16Array;
  /** 1 where the cell holds ink. */
  cells: Uint8Array;
  /** How many ink pixels the cell holds. */
  counts: Uint32Array;
}

/** Longest side in cells the detector ever works on. */
const MAX_GRID_SIDE = 400;

/** Grid does not get finer than one cell per this many pixels. */
export function cellSize(longest: number): number {
  return Math.max(1, Math.ceil(longest / MAX_GRID_SIDE));
}

/** Folds an ink mask into grid cells, counting each cell's ink pixels. */
export function buildGridMap(mask: Uint8Array, w: number, h: number, f: number): GridMap {
  const gw = Math.ceil(w / f);
  const gh = Math.ceil(h / f);
  const cells = new Uint8Array(gw * gh);
  const counts = new Uint32Array(gw * gh);
  const col = columnMap(w, f);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const cy = ((y / f) | 0) * gw;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      const c = cy + col[x];
      cells[c] = 1;
      counts[c]++;
    }
  }
  return { gw, gh, f, col, cells, counts };
}

function columnMap(w: number, f: number): Uint16Array {
  const col = new Uint16Array(w);
  for (let x = 0; x < w; x++) col[x] = (x / f) | 0;
  return col;
}
