// raster.ts — rasterizing the export SVG to JPEG for the "SVG to
// upload" tab (design §2.9): the vectors render DIRECTLY at the integer
// target dimensions (never an upscaled thumbnail), the background is
// flattened (canvas pre-fill + the export's own background rect — JPEG has
// no alpha), and the result is verified by DECODING it back: the SOF
// segment must report exactly the target dimensions (RULE 15). The canvas
// transport is injectable so tests exercise the real pipeline with a fake.

import { readJpegDimensions } from "./jpeg";
import { sha256Hex } from "./hash";
import { normalizeHex } from "../svgbackground";

export interface RasterTarget {
  width: number;
  height: number;
  /** JPEG quality 0.5..1. */
  quality: number;
  /** Normalized #rrggbb the canvas is pre-filled with (alpha flattened onto it). */
  background: string;
}

export interface RasterRecord {
  width: number;
  height: number;
  /** The real pixel count in megapixels (width × height / 1e6). */
  megapixels: number;
  quality: number;
  bytes: number;
  hash: string;
  /** canvas.toBlob emits baseline JPEG. */
  profile: string;
}

export type RasterResult =
  | { ok: true; jpeg: Uint8Array; record: RasterRecord }
  | { ok: false; reason: string };

/** The browser transports (injectable for tests). */
export interface RasterDeps {
  render?: (svgText: string, target: RasterTarget) => Promise<HTMLCanvasElement>;
  encode?: (canvas: HTMLCanvasElement, quality: number) => Promise<Uint8Array>;
}

/** The export SVG → a verified JPEG at the target size. */
export async function rasterizeJpeg(svgText: string, target: RasterTarget, deps: RasterDeps = {}): Promise<RasterResult> {
  let jpeg: Uint8Array;
  try {
    const canvas = await (deps.render ?? renderSvg)(svgText, target);
    jpeg = await (deps.encode ?? encodeJpeg)(canvas, target.quality);
  } catch (error) {
    return { ok: false, reason: `render failed: ${error instanceof Error ? error.message : "unknown error"}` };
  }
  const dims = readJpegDimensions(jpeg);
  if (dims === null || dims.width !== target.width || dims.height !== target.height) {
    const got = dims === null ? "undecodable" : `${dims.width}x${dims.height}`;
    return { ok: false, reason: `decoded dimensions ${got} do not match the target ${target.width}x${target.height}` };
  }
  return { ok: true, jpeg, record: await recordOf(jpeg, target) };
}

async function recordOf(jpeg: Uint8Array, target: RasterTarget): Promise<RasterRecord> {
  return {
    width: target.width,
    height: target.height,
    megapixels: (target.width * target.height) / 1e6,
    quality: target.quality,
    bytes: jpeg.length,
    hash: await sha256Hex(jpeg),
    profile: "baseline",
  };
}

/** Renders the SVG at exactly the target size onto a background-filled canvas. */
async function renderSvg(svgText: string, target: RasterTarget): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2d canvas context");
    ctx.fillStyle = normalizeHex(target.background) ?? "#ffffff";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(img, 0, 0, target.width, target.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b === null ? reject(new Error("JPEG encode failed")) : resolve(b)), "image/jpeg", quality);
  });
  return new Uint8Array(await blob.arrayBuffer());
}
