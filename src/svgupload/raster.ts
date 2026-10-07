// raster.ts — vectors straight to a ~15.1 MP JPEG (design §7, research 6).
// Why canvas and not the AI thumbnail: the request forbids enlarging a raster.
// The export SVG is loaded as an image at its natural artboard size and drawn
// once, scaled to integer dimensions computed by lib/svgupload/target, with the
// chosen background painted first so the JPEG has no alpha. The result is then
// DECODED again and measured (format, dimensions, readability) before it counts
// as an output, and the measured numbers — not the requested ones — are what the
// export JSON records.

import { COMPARE } from "../lib/svgupload/optimize";
import { jpegTarget, mpOf, type JpegDims } from "../lib/svgupload/target";
import { insertMetadata, jpegDimensions, verifyMetadata, type JpegMeta } from "../lib/svgupload/jpegseg";

export interface RasterArgs {
  svg: string;
  /** Flattened behind the artwork; null means white (JPEG has no transparency). */
  background: string | null;
  /** Target megapixels (15.1 by default). */
  targetMp: number;
  /** The artboard's aspect ratio (width / height). */
  ratio: number;
  quality: number;
  /** Metadata written into the JPEG's APP1/APP13, or null to skip. */
  meta: JpegMeta | null;
}

export type RasterOut =
  | { ok: true; blob: Blob; bytes: Uint8Array; dims: JpegDims; md: JpegMeta | null; warnings: string[] }
  | { ok: false; reason: string };

/** Chromium needs an <img> for the draw; other DOMs (tests) inject their own. */
export interface RasterSeams {
  createImage: () => HTMLImageElement;
  createCanvas: (width: number, height: number) => HTMLCanvasElement;
}

export function defaultSeams(): RasterSeams {
  return {
    createImage: () => new Image(),
    createCanvas: (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
  };
}

export async function rasterize(args: RasterArgs, seams: RasterSeams = defaultSeams()): Promise<RasterOut> {
  const dims = jpegTarget(args.targetMp, args.ratio);
  const url = URL.createObjectURL(new Blob([args.svg as unknown as BlobPart], { type: "image/svg+xml" }));
  try {
    const image = await loadImage(seams.createImage(), url);
    if (image === null) return { ok: false, reason: "The export SVG could not be drawn as an image." };
    const canvas = draw(image, seams.createCanvas(dims.width, dims.height), args.background, dims);
    const raw = await toBlob(canvas, args.quality);
    if (raw === null) return { ok: false, reason: `The canvas could not be encoded as JPEG at ${dims.width}×${dims.height}.` };
    return await finish(raw, dims, args, seams);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decodes, measures and re-verifies what will be written (§7/§11). */
async function finish(raw: Blob, dims: JpegDims, args: RasterArgs, seams: RasterSeams): Promise<RasterOut> {
  const bytes = new Uint8Array(await raw.arrayBuffer());
  const written = args.meta === null ? bytes : withMetadata(bytes, args.meta);
  if (args.meta !== null && written === null) return { ok: false, reason: "The JPEG metadata could not be written (the encoder produced something that is not a JPEG)." };
  const payload = written ?? bytes;
  const check = await verifyBlob(payload, seams);
  if (check !== null) return { ok: false, reason: check };
  const md = args.meta === null ? null : readBack(payload, args.meta);
  if (typeof md === "string") return { ok: false, reason: md };
  const measured = jpegDimensions(payload);
  const outDims: JpegDims = measured === null ? dims : { ...dims, width: measured.width, height: measured.height, mp: mpOf(measured.width, measured.height) };
  return { ok: true, blob: new Blob([payload as unknown as BlobPart], { type: "image/jpeg" }), bytes: payload, dims: outDims, md, warnings: warningsOf(outDims, dims) };
}

function withMetadata(bytes: Uint8Array, meta: JpegMeta): Uint8Array | null {
  const out = insertMetadata(bytes, meta);
  return out.ok ? out.bytes : null;
}

/** The metadata must be readable back AND equal to what was accepted. */
function readBack(bytes: Uint8Array, meta: JpegMeta): JpegMeta | null | string {
  const check = verifyMetadata(bytes, meta);
  return check.ok ? meta : `The JPEG metadata did not survive the write: ${check.errors.join(" ")}`;
}

/** A JPEG that cannot be decoded again is not an output (§7). */
async function verifyBlob(bytes: Uint8Array, seams: RasterSeams): Promise<string | null> {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "image/jpeg" }));
  try {
    const image = await loadImage(seams.createImage(), url);
    if (image === null) return "The written JPEG could not be decoded again.";
    if (image.naturalWidth === 0 || image.naturalHeight === 0) return "The written JPEG has no readable pixels.";
    if (!hasJpegHeader(bytes)) return "The written file does not start with a JPEG header.";
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function warningsOf(measured: JpegDims, requested: JpegDims): string[] {
  if (measured.width !== requested.width || measured.height !== requested.height) {
    return [`The encoder wrote ${measured.width}×${measured.height} instead of ${requested.width}×${requested.height}.`];
  }
  if (requested.clamped) return [`The canvas limit capped this export at ${measured.mp} MP (requested ${requested.mp}).`];
  return [];
}

/** Paints the background first, then the artwork scaled to the canvas. */
function draw(image: HTMLImageElement, canvas: HTMLCanvasElement, background: string | null, dims: JpegDims): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return canvas;
  ctx.fillStyle = background ?? "#ffffff"; // JPEG has no alpha: flatten, never leave holes
  ctx.fillRect(0, 0, dims.width, dims.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, dims.width, dims.height);
  return canvas;
}

function loadImage(image: HTMLImageElement, url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => { image.onload = null; image.onerror = null; resolve(ok ? image : null); };
    image.onload = () => { done(true); };
    image.onerror = () => { done(false); };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => { resolve(blob); }, "image/jpeg", quality);
  });
}

/**
 * The pixels the optimizer's appearance gate compares (merge report §3.1): one
 * document flattened on white at the compare size. BOTH sides are rendered the
 * same way, so the comparison is about the picture rather than the rasteriser.
 * Null when the document cannot be drawn — the gate reads that as a difference,
 * never as a pass.
 */
export async function renderPixels(svg: string, seams: RasterSeams = defaultSeams()): Promise<Uint8Array | null> {
  const { width, height } = COMPARE;
  const url = URL.createObjectURL(new Blob([svg as unknown as BlobPart], { type: "image/svg+xml" }));
  try {
    const image = await loadImage(seams.createImage(), url);
    if (image === null) return null;
    const canvas = draw(image, seams.createCanvas(width, height), "#ffffff", { width, height, mp: 0, clamped: false });
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    return new Uint8Array(ctx.getImageData(0, 0, width, height).data);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The small JPEG the metadata call LOOKS at. Deliberately not the export: a
 * vision request needs a legible 512 px image, and the export JPEG must stay a
 * genuine 15.1 MP render. Returns a data URL, or null when the SVG cannot be
 * drawn (the caller reports it — no request is sent without an image).
 */
export async function thumbnailDataUrl(svg: string, background: string | null, size = 512, seams: RasterSeams = defaultSeams()): Promise<string | null> {
  const url = URL.createObjectURL(new Blob([svg as unknown as BlobPart], { type: "image/svg+xml" }));
  try {
    const image = await loadImage(seams.createImage(), url);
    if (image === null) return null;
    const ratio = image.naturalHeight === 0 ? 1 : image.naturalWidth / image.naturalHeight;
    const width = Math.max(1, Math.round(ratio >= 1 ? size : size * ratio));
    const height = Math.max(1, Math.round(ratio >= 1 ? size / ratio : size));
    const canvas = draw(image, seams.createCanvas(width, height), background ?? "#ffffff", { width, height, mp: mpOf(width, height), clamped: false });
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function hasJpegHeader(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}
