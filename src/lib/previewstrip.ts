// previewstrip.ts — one row's icons as a horizontal strip (design D6/D8).
// Owns: a split plan -> chunk canvases -> PNG blobs, at thumbnail size. It draws
// through the shipped renderer with the sheet's own output settings, so a preview
// and the split it predicts cannot drift apart (RULE 10). Writes nothing: no FS,
// no state, no blob URLs — the cache keeps the blobs (I-68).

import type { SplitPlan } from "./batchsplit";
import { CHUNK_ICONS, MAX_ICONS_PER_ROW, THUMB_PX } from "./previewlimits";
import { canvasToBlob, renderIcon, type ExportOpts } from "./render";
import type { SplitSettings } from "./presets";

export interface StripChunks {
  /** Icons per chunk canvas, in order. */
  counts: number[];
  /** How many icons the strip shows in total (<= MAX_ICONS_PER_ROW). */
  shown: number;
  /** True when the row has more icons than the strip shows. */
  capped: boolean;
}

/** How a row's icon count becomes chunk canvases — the one place that decides (D7/D8). */
export function stripChunks(icons: number, chunkIcons: number = CHUNK_ICONS): StripChunks {
  if (icons <= 0) return { counts: [], shown: 0, capped: false };
  const shown = Math.min(icons, MAX_ICONS_PER_ROW);
  const size = Math.max(1, Math.min(chunkIcons, MAX_ICONS_PER_ROW));
  const counts: number[] = [];
  for (let left = shown; left > 0; left -= size) counts.push(Math.min(size, left));
  return { counts, shown, capped: icons > shown };
}

interface StripCtx {
  img: HTMLImageElement;
  plan: SplitPlan;
  opts: ExportOpts;
  thumb: number;
}

/** The output settings a preview and the split share (one mapping, D2). */
export function splitOptions(split: SplitSettings): ExportOpts {
  return { padding: split.padding, size: split.size, transparent: split.transparent };
}

/** One canvas per chunk; chunk n holds plan.counts[n] icons, left to right. */
export function renderStrip(
  img: HTMLImageElement,
  plan: SplitPlan,
  split: SplitSettings,
  thumb: number = THUMB_PX,
): HTMLCanvasElement[] {
  const ctx: StripCtx = { img, plan, opts: splitOptions(split), thumb };
  const out: HTMLCanvasElement[] = [];
  let first = 0;
  for (const count of stripChunks(plan.boxes.length).counts) {
    out.push(chunkCanvas(ctx, first, count));
    first += count;
  }
  return out;
}

/** Transcodes the strip; one PNG blob per chunk, still writing nothing. */
export async function stripBlobs(
  img: HTMLImageElement,
  plan: SplitPlan,
  split: SplitSettings,
  thumb: number = THUMB_PX,
): Promise<Blob[]> {
  const out: Blob[] = [];
  for (const c of renderStrip(img, plan, split, thumb)) out.push(await canvasToBlob(c));
  return out;
}

function chunkCanvas(ctx: StripCtx, first: number, count: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = count * ctx.thumb;
  c.height = ctx.thumb;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  for (let i = 0; i < count; i++) {
    const icon = renderIcon(ctx.img, ctx.plan.an, ctx.plan.boxes, ctx.plan.boxes[first + i], ctx.plan.sq, ctx.opts, ctx.thumb);
    g.drawImage(icon, i * ctx.thumb, 0, ctx.thumb, ctx.thumb);
  }
  return c;
}
