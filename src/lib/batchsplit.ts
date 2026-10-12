// batchsplit.ts — split one source image into PNG blobs (RULE 1: pixel math
// stays in lib/detect + lib/render; this file only orchestrates).
// Owns: sheet -> analyzed -> detected boxes -> rendered blob per icon.

import { analyze, detect, type Analysis, type Box } from "./detect";
import { canvasToBlob, renderIcon, squareInfo, type SquareInfo } from "./render";
import type { SplitSettings } from "./presets";

export interface SplitPlan {
  an: Analysis;
  boxes: Box[];
  usedFrac: number;
  autoFrac: number;
  sq: SquareInfo;
}

interface SheetCtx {
  img: HTMLImageElement;
  plan: SplitPlan;
  split: SplitSettings;
}

/**
 * Analyze + detect one sheet: the ONE plan both "Split selected" and every
 * preview go through, so what a preview shows is what a split writes (design
 * D2/RULE 10). Pure reading of the image, no IO.
 */
export function planSplit(img: HTMLImageElement, split: SplitSettings): SplitPlan {
  const an = analyze(img);
  const det = detect(an, split.mergeFrac);
  const sq = squareInfo(det.boxes, split.padding); // 1 px square for an empty sheet
  return { an, boxes: det.boxes, usedFrac: det.usedFrac, autoFrac: det.autoFrac, sq };
}

/** Splits a loaded sheet image; returns one PNG blob per detected icon. */
export async function splitSheet(img: HTMLImageElement, split: SplitSettings): Promise<Blob[]> {
  const plan = planSplit(img, split);
  if (plan.boxes.length === 0) return []; // honest empty (RULE 4)
  return renderAll({ img, plan, split });
}

async function renderAll(ctx: SheetCtx): Promise<Blob[]> {
  const opts = { padding: ctx.split.padding, size: ctx.split.size, transparent: ctx.split.transparent };
  const out: Blob[] = [];
  for (const b of ctx.plan.boxes) {
    out.push(await canvasToBlob(renderIcon(ctx.img, ctx.plan.an, ctx.plan.boxes, b, ctx.plan.sq, opts)));
  }
  return out;
}
