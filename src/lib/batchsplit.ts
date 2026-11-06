// batchsplit.ts — split one source image into PNG blobs (RULE 1: pixel math
// stays in lib/detect + lib/render; this file only orchestrates).
// Owns: sheet -> analyzed -> detected boxes -> rendered blob per icon.
// Yields between heavy steps to keep UI responsive (RULE 5/7).

import { analyzeAsync, detectAsync, type Analysis, type Box, type SheetSource } from "./detect";
import { canvasToBlob, renderIconAsync, squareInfo, type SquareInfo } from "./render";
import type { SplitSettings } from "./presets";
import { yieldBudget } from "./yield";

interface SheetCtx {
  img: SheetSource;
  an: Analysis;
  boxes: Box[];
  sq: SquareInfo;
  split: SplitSettings;
}

export interface SplitOpts {
  shouldStop?: () => boolean;
}

/** Splits a loaded sheet image; returns one PNG blob per detected icon. */
export async function splitSheet(img: SheetSource, split: SplitSettings, opts?: SplitOpts): Promise<Blob[]> {
  const breathe = yieldBudget();
  if (opts?.shouldStop?.()) return [];
  const an = await analyzeAsync(img); // yields inside when its own work ran long
  if (opts?.shouldStop?.()) return [];
  const det = await detectAsync(an, split.mergeFrac);
  await breathe();
  if (det.boxes.length === 0) return []; // honest empty (RULE 4)
  return renderAll({ img, an, boxes: det.boxes, sq: squareInfo(det.boxes, split.padding), split }, opts, breathe);
}

async function renderAll(ctx: SheetCtx, opts: SplitOpts | undefined, breathe: () => Promise<void>): Promise<Blob[]> {
  const renderOpts = { padding: ctx.split.padding, size: ctx.split.size, transparent: ctx.split.transparent };
  const canvases: HTMLCanvasElement[] = [];
  for (const b of ctx.boxes) {
    if (opts?.shouldStop?.()) break;
    canvases.push(await renderIconAsync(ctx.img, ctx.an, ctx.boxes, b, ctx.sq, renderOpts));
    await breathe();
  }
  // PNG encoding runs off the main thread — all encodes in flight together.
  return Promise.all(canvases.map(canvasToBlob));
}
