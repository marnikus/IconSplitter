// svgimgpixels.ts — one square edit reference and its verified per-pair crops.
// All canvas and pixel geometry stays in lib (RULE 1); neither the returned
// resolution nor the visible list order changes the saved slot-to-pair mapping.

import { loadSheet } from "./dom";
import { canvasToPng, COMPOSITE_BG, renderComposite, type CompositeImage } from "./svgcanvas";
import { compositeLayout } from "./svgcomposite";
import { MIN_EDIT_CELL, returnedCellRect, type ImageEditCell, type ImageEditGroup, type PixelRect } from "./svgimgbatch";

export interface EditedCrop { id: string; blob: Blob }
const MAX_RETURN_PIXELS = 4096 * 4096;
const MAX_RETURN_BYTES = 64 * 1024 * 1024;

/** Adapt the shared SVG contact-sheet renderer to a full square edit grid. */
export function renderEditSheet(group: ImageEditGroup, images: readonly CompositeImage[]): HTMLCanvasElement {
  if (images.length !== group.cells.length) throw new Error("The image-edit references do not match the planned cells");
  const cell = group.size / group.cols;
  const padding = Math.min(12, Math.max(0, (cell - MIN_EDIT_CELL) / 2));
  const layout = compositeLayout(group.cells.length, { cell, padding, max: group.size });
  return renderComposite({ ...layout, rows: group.cols, empty: group.empty }, images, COMPOSITE_BG);
}

/** The returned composite is decoded once; each occupied slot becomes its own PNG. */
export async function cropEditedSheet(group: ImageEditGroup, blob: Blob): Promise<EditedCrop[]> {
  if (blob.size === 0) throw new Error("The image response was empty");
  const normalized = await normalizedReturnedBlob(blob);
  const image = await loadSheet(new File([normalized], "edited-image", { type: normalized.type }));
  try {
    const width = "naturalWidth" in image ? image.naturalWidth : image.width;
    const height = "naturalHeight" in image ? image.naturalHeight : image.height;
    validateResponse(width, height);
    const crops: EditedCrop[] = [];
    for (const cell of group.cells) crops.push(await cropCell(image, cell, width, height));
    return crops;
  } finally {
    if ("close" in image && typeof image.close === "function") image.close();
  }
}

/** A base64 image may be mislabeled PNG by the router; its preview must still paint. */
export async function normalizedReturnedBlob(blob: Blob): Promise<Blob> {
  if (blob.size > MAX_RETURN_BYTES) throw new Error("The returned image exceeds the safe byte limit");
  const mime = await returnedMime(blob);
  return blob.type === mime ? blob : blob.slice(0, blob.size, mime);
}

/** Trust file signatures, not the provider's optional/mislabeled MIME header. */
async function returnedMime(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  const text = String.fromCharCode(...bytes);
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "image/webp";
  throw new Error("The returned image bytes are not PNG, JPEG or WebP");
}

function validateResponse(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > MAX_RETURN_PIXELS || Math.abs(width - height) > 1 || width < 1 || height < 1) {
    throw new Error("The returned image is not a usable square (or exceeds the pixel limit)");
  }
}

async function cropCell(image: CanvasImageSource, cell: ImageEditCell, width: number, height: number): Promise<EditedCrop> {
  const rect = returnedCellRect(cell, width, height);
  const canvas = cropCanvas(image, rect);
  const blob = await canvasToPng(canvas);
  if (blob.type !== "image/png" || blob.size === 0) throw new Error(`Could not encode a PNG for ${cell.name}`);
  return { id: cell.id, blob };
}

/** A one-pixel fractional edge becomes padding, never a stretched icon. */
function cropCanvas(image: CanvasImageSource, rect: PixelRect): HTMLCanvasElement {
  const side = Math.max(rect.w, rect.h);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context unavailable for the returned image");
  ctx.fillStyle = COMPOSITE_BG;
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, (side - rect.w) / 2, (side - rect.h) / 2, rect.w, rect.h);
  return canvas;
}
