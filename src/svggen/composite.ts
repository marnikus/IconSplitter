// composite.ts — build the square contact sheet for one batch (spec §3/§12).
// Decoding and the canvas are injected so the logic runs against fakes in
// tests (RULE 8); the browser wiring passes createImageBitmap + OffscreenCanvas.
// Any decode failure aborts: a partial sheet would mislabel positions, so no
// request is sent (spec §14).

import { compositeCells, fitRect, type CellRect, type FitRect } from "../lib/svgcomposite";
import { fnv1a } from "../lib/svggrid";
import type { GridLayout } from "../lib/svggrid";

export interface BitmapLike { width: number; height: number }

export interface CompositeDeps {
  decode: (file: File) => Promise<BitmapLike>;
  makeCanvas: (size: number) => CanvasLike;
}

export interface CanvasLike {
  width: number;
  height: number;
  ctx: {
    fillStyle: string;
    fillRect: (x: number, y: number, w: number, h: number) => void;
    drawImage: (img: BitmapLike, r: FitRect) => void;
  };
  toBlob: () => Promise<Blob>;
}

export interface CompositeOut {
  blob: Blob;
  hash: string;
  cells: CellRect[];
}

export const COMPOSITE_BG = "#0c1222";

export interface CompositeOpts { canvasSize?: number; padding?: number }

export async function buildComposite(
  files: File[], grid: GridLayout, deps: CompositeDeps, opts: CompositeOpts = {},
): Promise<CompositeOut> {
  const canvasSize = opts.canvasSize ?? 1024;
  const padding = opts.padding ?? 16;
  const cells = compositeCells(grid, canvasSize);
  const imgs: BitmapLike[] = [];
  for (const f of files) imgs.push(await deps.decode(f)); // any failure aborts: no sheet, no request
  const canvas = deps.makeCanvas(canvasSize);
  canvas.ctx.fillStyle = COMPOSITE_BG;
  canvas.ctx.fillRect(0, 0, canvasSize, canvasSize);
  imgs.forEach((img, i) => {
    canvas.ctx.drawImage(img, fitRect(cells[i], img.width, img.height, padding));
  });
  const blob = await canvas.toBlob();
  return { blob, hash: fnv1a(await blob.text()), cells };
}
