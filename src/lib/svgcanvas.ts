// svgcanvas.ts — composite contact-sheet pixels (RULE 1: canvas math lives in lib).
// Owns: drawing one square PNG from a batch layout, with every source image
// aspect-preserved and centred inside its equal-size cell, and turning that
// canvas into the bytes the provider receives. Pure inputs in, canvas out.

import { fitRect, type CompositeLayout } from "./svgcomposite";
import { fnv1a32 } from "./pairing";

export interface CompositeImage {
  src: CanvasImageSource;
  w: number;
  h: number;
}

/** Neutral background: light enough for dark icons, dark enough for light ones. */
export const COMPOSITE_BG = "#f4f5f7";

/** Draws the contact sheet. Empty cells are left as background, never drawn. */
export function renderComposite(layout: CompositeLayout, images: readonly CompositeImage[], background = COMPOSITE_BG): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = layout.size;
  canvas.height = layout.size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, layout.size, layout.size);
  for (const cell of layout.cells) {
    const img = images[cell.position - 1];
    if (!img) continue; // unused cell: nothing to draw, nothing to send back
    const r = fitRect(img.w, img.h, cell);
    ctx.drawImage(img.src, r.x, r.y, r.w, r.h);
  }
  return canvas;
}

/** PNG bytes for the provider request (data URL when toBlob is unavailable). */
export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  if (typeof canvas.toBlob === "function") {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
    if (blob) return blob;
  }
  return dataUrlToBlob(canvas.toDataURL("image/png"));
}

function dataUrlToBlob(url: string): Blob {
  const comma = url.indexOf(",");
  const bytes = atob(url.slice(comma + 1));
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type: "image/png" });
}

/** Stable short hash of the composite bytes — stored in the pair file’s batch ref. */
export function hashBytes(text: string): string {
  return fnv1a32(text).toString(16).padStart(8, "0");
}
