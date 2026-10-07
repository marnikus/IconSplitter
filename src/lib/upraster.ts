// upraster.ts — the JPEG production pipeline (prompt §7). Owns: the canvas
// drawing step (background fill FIRST — alpha flattening — then the vector
// draw at the exact integer pixel size), the browser rasterizer/decoder/SHA-256
// adapters, and the produceJpeg orchestration that rasterizes vectors directly
// at the declared megapixels and verifies structure, dimensions, decodability
// and hash before a byte is accepted. Nothing here enlarges a thumbnail.

import { actualMpx, rasterSize, type FitPlan, type RasterSize } from "./upfit";
import { jpegDimensions } from "./upjpegmeta";

export interface RasterSettings {
  mpx: number;
  quality: number;
  background: string;
}

export type JpegOutcome =
  | { ok: true; bytes: Uint8Array; width: number; height: number; mpx: number; hash: string }
  | { ok: false; error: string };

export interface RasterDeps {
  rasterize(svg: string, width: number, height: number, background: string, quality: number): Promise<Uint8Array | null>;
  decode(bytes: Uint8Array): Promise<boolean>;
  sha256(bytes: Uint8Array): Promise<string>;
}

/** Renders a decoded SVG image onto a canvas: opaque background, then vectors. */
export interface DrawArgs {
  canvas: HTMLCanvasElement;
  img: CanvasImageSource;
  width: number;
  height: number;
  background: string;
}

export function drawRenderedIcon(a: DrawArgs): void {
  a.canvas.width = a.width;
  a.canvas.height = a.height;
  const ctx = a.canvas.getContext("2d");
  if (ctx === null) return;
  ctx.fillStyle = a.background;
  ctx.fillRect(0, 0, a.width, a.height); // flatten transparency onto the chosen opaque colour
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(a.img, 0, 0, a.width, a.height);
}

/**
 * The verified pipeline: compute dimensions from the artboard, rasterize,
 * check the JPEG frame header, decode fully, then hash. Any check failing is
 * an honest error — a wrong-size or unreadable JPEG is never delivered.
 */
export async function produceJpeg(svg: string, plan: FitPlan, s: RasterSettings, deps: RasterDeps): Promise<JpegOutcome> {
  const size = rasterSize(plan, s.mpx);
  const raw = await deps.rasterize(svg, size.width, size.height, s.background, s.quality);
  if (raw === null) return { ok: false, error: "the rasterizer produced no image" };
  const dims = jpegDimensions(raw);
  if (dims === null) return { ok: false, error: "the rendered JPEG has no readable frame header" };
  if (dims.width !== size.width || dims.height !== size.height) {
    return { ok: false, error: `rendered ${dims.width}×${dims.height}, expected ${size.width}×${size.height}` };
  }
  if (!(await deps.decode(raw))) return { ok: false, error: "the rendered JPEG did not decode" };
  return { ok: true, bytes: raw, width: dims.width, height: dims.height, mpx: actualMpx(dims), hash: await deps.sha256(raw) };
}

/** The dimensions a plan/settings pair will render at (shown before sending). */
export function plannedRaster(plan: FitPlan, mpx: number): RasterSize {
  return rasterSize(plan, mpx);
}

/** Browser adapter: SVG text → Image → canvas → JPEG bytes (vectors at full size). */
export interface BrowserRasterArgs {
  svg: string;
  width: number;
  height: number;
  background: string;
  quality: number;
}

export async function browserRasterize(a: BrowserRasterArgs): Promise<Uint8Array | null> {
  const url = URL.createObjectURL(new Blob([a.svg], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    drawRenderedIcon({ canvas, img, width: a.width, height: a.height, background: a.background });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", a.quality));
    return blob === null ? null : new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Browser adapter: full decode of the produced JPEG (readability check). */
export async function browserDecode(bytes: Uint8Array): Promise<boolean> {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "image/jpeg" }));
  try {
    const img = await loadImage(url);
    return img.width > 0 && img.height > 0;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Browser adapter: SHA-256 hex digest via WebCrypto. */
export async function subtleSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the image did not decode"));
    img.src = url;
  });
}
