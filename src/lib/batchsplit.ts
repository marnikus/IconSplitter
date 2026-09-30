// batchsplit.ts — split one source image into PNG blobs (RULE 1: pixel math
// stays in lib/detect + lib/render; this file only orchestrates).
// Owns: sheet -> analyzed -> detected boxes -> rendered blob per icon.

import { analyze, detect, type Analysis, type Box } from "./detect";
import { canvasToBlob, renderIcon, squareInfo, type SquareInfo } from "./render";
import type { SplitSettings } from "./presets";

interface SheetCtx {
  img: HTMLImageElement;
  an: Analysis;
  boxes: Box[];
  sq: SquareInfo;
  split: SplitSettings;
}

/** Splits a loaded sheet image; returns one PNG blob per detected icon. */
export async function splitSheet(img: HTMLImageElement, split: SplitSettings): Promise<Blob[]> {
  const an = analyze(img);
  const det = detect(an, split.mergeFrac);
  if (det.boxes.length === 0) return []; // honest empty (RULE 4)
  return renderAll({ img, an, boxes: det.boxes, sq: squareInfo(det.boxes, split.padding), split });
}

async function renderAll(ctx: SheetCtx): Promise<Blob[]> {
  const opts = { padding: ctx.split.padding, size: ctx.split.size, transparent: ctx.split.transparent };
  const out: Blob[] = [];
  for (const b of ctx.boxes) {
    out.push(await canvasToBlob(renderIcon(ctx.img, ctx.an, ctx.boxes, b, ctx.sq, opts)));
  }
  return out;
}
