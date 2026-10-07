// uploadraster.ts — vectors to JPEG pixels (RULE 1: canvas work lives in lib).
// Owns: turning the PREPARED export SVG into the exact integer canvas the
// artboard computed, painting the opaque background first (so alpha is flattened
// by construction), encoding JPEG at the configured quality, and decoding the
// result back to prove what was written. The SVG is rendered by the browser's
// own vector rasteriser at the target size — a 15.1 MP JPEG is rendered at
// 15.1 MP, never enlarged from a thumbnail.
//
// Every browser-owned step is injectable (`RasterDeps`), so the pipeline can be
// unit-tested with a recording canvas and the real path stays a thin adapter.

import type { PixelSize } from "./uploadartboard";

export interface RasterRequest {
  /** The prepared export SVG (artboard applied, plate painted, strokes set). */
  svg: string;
  px: PixelSize;
  /** Opaque colour the alpha is flattened onto. */
  background: string;
  /** JPEG quality, 0.4 – 1. */
  quality: number;
}

export interface RasterResult {
  ok: boolean;
  blob: Blob | null;
  error: string | null;
  width: number;
  height: number;
  bytes: number;
}

export interface RasterDeps {
  /** Loads the SVG data URL into something drawable. */
  load: (url: string) => Promise<CanvasImageSource & { width: number; height: number }>;
  createCanvas: (width: number, height: number) => HTMLCanvasElement;
  /** JPEG bytes for a canvas; separated so a test never needs a real encoder. */
  encode: (canvas: HTMLCanvasElement, quality: number) => Promise<Blob | null>;
}

/** The SVG as a data URL — the same encoding the SVG tab's preview uses. */
export function svgDataUrl(code: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`;
}

/** Renders, paints the background, encodes and reports what came out. */
export async function rasterize(request: RasterRequest, deps: RasterDeps = browserDeps()): Promise<RasterResult> {
  const { width, height } = request.px;
  try {
    const image = await deps.load(svgDataUrl(request.svg));
    const canvas = deps.createCanvas(width, height);
    const context = canvas.getContext("2d");
    if (context === null) return failure("canvas 2d context unavailable", width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = request.background;
    context.fillRect(0, 0, width, height); // alpha never survives: the plate is painted first
    context.drawImage(image, 0, 0, width, height);
    const blob = await deps.encode(canvas, clampQuality(request.quality));
    if (blob === null) return failure("the encoder returned no bytes", width, height);
    return { ok: true, blob, error: null, width, height, bytes: blob.size };
  } catch (error) {
    return failure(error instanceof Error ? error.message : "the render failed", width, height);
  }
}

function failure(error: string, width: number, height: number): RasterResult {
  return { ok: false, blob: null, error, width, height, bytes: 0 };
}

function clampQuality(quality: number): number {
  return Number.isFinite(quality) ? Math.min(1, Math.max(0.4, quality)) : 0.92;
}

/** The browser's own picture: an `<img>` for the SVG, a canvas, JPEG bytes. */
export function browserDeps(): RasterDeps {
  return {
    load: loadImage,
    createCanvas: (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    encode: (canvas, quality) => new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality)),
  };
}

async function loadImage(url: string): Promise<CanvasImageSource & { width: number; height: number }> {
  const image = new Image();
  image.decoding = "sync";
  image.src = url;
  await image.decode();
  return image;
}

/** The blob's bytes, so the record can hash and the metadata can be embedded. */
export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export interface DecodedImage {
  width: number;
  height: number;
  error: string | null;
}

/**
 * Decodes the produced JPEG again (a second, independent read of the bytes) —
 * the brief's "decode output to verify format, dimensions, readability".
 * A decoder is injected so a test can prove the check fails on a stub.
 */
export async function decodeVerify(bytes: Uint8Array, mimeType: string, decode?: (blob: Blob) => Promise<DecodedImage>): Promise<DecodedImage> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  const reader = decode ?? decodeWithImage;
  try {
    return await reader(blob);
  } catch (error) {
    return { width: 0, height: 0, error: error instanceof Error ? error.message : "the output could not be decoded" };
  }
}

async function decodeWithImage(blob: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    return { width: image.width, height: image.height, error: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}
