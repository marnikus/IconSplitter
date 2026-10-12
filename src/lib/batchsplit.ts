// batchsplit.ts — split one source image into PNG blobs (RULE 1: pixel math
// stays in lib/detect + lib/render; this file only orchestrates).
// Owns: sheet -> analyzed -> detected boxes -> rendered blob per icon.
// Yields between heavy steps to keep UI responsive (RULE 5/7).

import { analyze, detect, type Analysis, type Box } from "./detect";
import { canvasToBlob, renderIcon, squareInfo, type SquareInfo } from "./render";
import type { SplitSettings } from "./presets";
import { yieldToUI } from "./yield";

interface SheetCtx {
  img: HTMLImageElement;
  an: Analysis;
  boxes: Box[];
  sq: SquareInfo;
  split: SplitSettings;
}

export interface SplitOpts {
  shouldStop?: () => boolean;
}

/** Splits a loaded sheet image; returns one PNG blob per detected icon. */
export async function splitSheet(img: HTMLImageElement, split: SplitSettings, opts?: SplitOpts): Promise<Blob[]> {
  if (opts?.shouldStop?.()) return [];
  const an = analyze(img);
  await yieldToUI();
  if (opts?.shouldStop?.()) return [];
  const det = detect(an, split.mergeFrac);
  await yieldToUI();
  if (det.boxes.length === 0) return []; // honest empty (RULE 4)
  return renderAll({ img, an, boxes: det.boxes, sq: squareInfo(det.boxes, split.padding), split }, opts);
}

async function renderAll(ctx: SheetCtx, opts?: SplitOpts): Promise<Blob[]> {
  const renderOpts = { padding: ctx.split.padding, size: ctx.split.size, transparent: ctx.split.transparent };
  const out: Blob[] = [];
  for (const b of ctx.boxes) {
    if (opts?.shouldStop?.()) break;
    const canvas = renderIcon(ctx.img, ctx.an, ctx.boxes, b, ctx.sq, renderOpts);
    await yieldToUI();
    out.push(await canvasToBlob(canvas));
    await yieldToUI();
  }
  return out;
}
