// svgcomposite.ts — contact-sheet geometry (batch spec §3): equal square
// cells across the canvas, and an aspect-preserving centered fit inside each
// cell. Drawing itself lives where a canvas exists (src/svggen).

import type { GridLayout } from "./svggrid";

export interface CellRect {
  index: number;
  x: number;
  y: number;
  size: number;
}

/** All cells of the grid, row-major, position index = cell index + 1 upstream. */
export function compositeCells(grid: GridLayout, canvas: number): CellRect[] {
  if (grid.cols === 0) return [];
  const size = canvas / grid.cols;
  const out: CellRect[] = [];
  for (let i = 0; i < grid.cells; i++) {
    out.push({ index: i, x: (i % grid.cols) * size, y: Math.floor(i / grid.cols) * size, size });
  }
  return out;
}

export interface FitRect { x: number; y: number; w: number; h: number }

/** Center the source image inside a cell with padding; never stretch/crop. */
export function fitRect(cell: CellRect, imgW: number, imgH: number, padding: number): FitRect {
  const avail = cell.size - padding * 2;
  const scale = Math.min(avail / imgW, avail / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: cell.x + (cell.size - w) / 2, y: cell.y + (cell.size - h) / 2, w, h };
}
